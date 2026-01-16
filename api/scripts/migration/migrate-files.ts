#!/usr/bin/env npx tsx
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * VantaHire Migration: Migrate Supabase Storage Files to Postgres
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Migrates files from Supabase storage buckets to the Postgres File table.
 * Reads from locally downloaded bucket folders or directly from Supabase storage API.
 *
 * Prerequisites:
 *   1. Download bucket files using Supabase CLI:
 *      supabase storage download -b company-logos -o ./migration_data/buckets/company-logos
 *      supabase storage download -b interview-documents -o ./migration_data/buckets/interview-documents
 *
 *   2. Or set SUPABASE_URL and SUPABASE_SERVICE_KEY to download directly
 *
 * Usage:
 *   DATABASE_URL="postgres://..." npx tsx scripts/migration/migrate-files.ts --in ./migration_data
 *
 * Options:
 *   --dry-run              Show what would be done without making changes
 *   --skip-existing        Skip files that already exist in the database
 *   --bucket <name>        Only migrate specific bucket (company-logos, interview-documents)
 */

import fs from 'fs';
import path from 'path';
import { PrismaClient, FileCategory } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';

const prisma = new PrismaClient();

// ─────────────────────────────────────────────────────────────────────────────
// CLI Args
// ─────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const inputDirIndex = args.indexOf('--in');
const dryRun = args.includes('--dry-run');
const skipExisting = args.includes('--skip-existing');
const bucketIndex = args.indexOf('--bucket');
const specificBucket = bucketIndex !== -1 ? args[bucketIndex + 1] : null;

if (inputDirIndex === -1) {
  console.error('Usage: npx tsx migrate-files.ts --in <input_dir> [--dry-run] [--skip-existing] [--bucket <name>]');
  process.exit(1);
}

const INPUT_DIR = args[inputDirIndex + 1];
const BUCKETS_DIR = path.join(INPUT_DIR, 'buckets');

// Supabase client for direct downloads (optional)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

// ─────────────────────────────────────────────────────────────────────────────
// Bucket Mapping
// ─────────────────────────────────────────────────────────────────────────────

interface BucketConfig {
  name: string;
  category: FileCategory;
  // Supabase path pattern to extract context (e.g., user_id, interview_id)
  pathPattern?: RegExp;
}

const BUCKET_CONFIGS: BucketConfig[] = [
  {
    name: 'company-logos',
    category: 'LOGO',
    // e.g., company-logos/{user_id}/{filename}
    pathPattern: /^([^/]+)\/(.+)$/,
  },
  {
    name: 'interview-documents',
    category: 'DOCUMENT',
    // e.g., interview-documents/{interview_id}/{filename}
    pathPattern: /^([^/]+)\/(.+)$/,
  },
  {
    name: 'resumes',
    category: 'RESUME',
    pathPattern: /^([^/]+)\/(.+)$/,
  },
];

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuidLike(value: string | null | undefined): boolean {
  return Boolean(value && UUID_REGEX.test(value));
}

function isImageFile(filename: string, metadata?: { mimetype?: string }): boolean {
  if (metadata?.mimetype?.startsWith('image/')) return true;
  const ext = path.extname(filename).toLowerCase();
  return ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext);
}

function looksLikeResume(objectPath: string, filename: string): boolean {
  const lower = `${objectPath}/${filename}`.toLowerCase();
  return lower.includes('resume') || lower.includes('cv');
}

function inferCategory(
  config: BucketConfig,
  objectPath: string,
  filename: string,
  metadata?: { mimetype?: string }
): FileCategory {
  if (config.name === 'company-logos') return 'LOGO';
  if (config.name === 'resumes') return 'RESUME';
  if (config.name === 'interview-documents') {
    if (isImageFile(filename, metadata)) return 'SCREENSHOT';
    if (looksLikeResume(objectPath, filename)) return 'RESUME';
    return 'DOCUMENT';
  }
  return config.category;
}

function extractContext(
  config: BucketConfig,
  objectPath: string,
  owner?: string
): { userId: string | null; interviewId: string | null; jobApplicationId: string | null } {
  const parts = objectPath.split('/').filter(Boolean);
  let userId: string | null = isUuidLike(owner) ? owner! : null;
  let interviewId: string | null = null;
  let jobApplicationId: string | null = null;

  const interviewIndex = parts.findIndex((p) => ['interviews', 'interview'].includes(p));
  if (interviewIndex !== -1 && isUuidLike(parts[interviewIndex + 1])) {
    interviewId = parts[interviewIndex + 1];
  }

  const applicationIndex = parts.findIndex((p) =>
    ['applications', 'job_applications', 'job-applications', 'jobapplications'].includes(p)
  );
  if (applicationIndex !== -1 && isUuidLike(parts[applicationIndex + 1])) {
    jobApplicationId = parts[applicationIndex + 1];
  }

  const userIndex = parts.findIndex((p) =>
    ['users', 'user', 'candidates', 'recruiters', 'profiles', 'candidate_profiles', 'recruiter_profiles'].includes(p)
  );
  if (userIndex !== -1 && isUuidLike(parts[userIndex + 1])) {
    userId = parts[userIndex + 1];
  }

  // Fallback: use first path segment if it looks like a UUID
  if (!userId && !interviewId && !jobApplicationId && parts[0] && isUuidLike(parts[0])) {
    if (config.name === 'company-logos' || config.name === 'resumes') {
      userId = parts[0];
    } else {
      interviewId = parts[0];
    }
  }

  return { userId, interviewId, jobApplicationId };
}

// ─────────────────────────────────────────────────────────────────────────────
// Storage Objects Metadata
// ─────────────────────────────────────────────────────────────────────────────

interface StorageObject {
  id: string;
  bucket_id: string;
  name: string;
  owner?: string;
  created_at?: string;
  updated_at?: string;
  metadata?: {
    mimetype?: string;
    size?: number;
    [key: string]: unknown;
  };
}

function readStorageObjects(): StorageObject[] {
  const filepath = path.join(INPUT_DIR, 'storage_objects.json');
  if (!fs.existsSync(filepath)) {
    console.warn('Warning: storage_objects.json not found');
    return [];
  }
  const content = fs.readFileSync(filepath, 'utf-8').trim();
  if (!content || content === 'null') {
    console.warn('Warning: storage_objects.json is empty');
    return [];
  }
  return JSON.parse(content);
}

// ─────────────────────────────────────────────────────────────────────────────
// File Reading
// ─────────────────────────────────────────────────────────────────────────────

async function readFileFromLocal(bucket: string, objectPath: string): Promise<Buffer | null> {
  const localPath = path.join(BUCKETS_DIR, bucket, objectPath);
  if (fs.existsSync(localPath)) {
    return fs.readFileSync(localPath);
  }
  return null;
}

async function readFileFromSupabase(bucket: string, objectPath: string): Promise<Buffer | null> {
  if (!supabase) return null;

  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .download(objectPath);

    if (error || !data) {
      console.warn(`  Warning: Failed to download ${bucket}/${objectPath}: ${error?.message}`);
      return null;
    }

    return Buffer.from(await data.arrayBuffer());
  } catch (err) {
    console.warn(`  Warning: Failed to download ${bucket}/${objectPath}: ${err}`);
    return null;
  }
}

async function readFile(bucket: string, objectPath: string): Promise<Buffer | null> {
  // Try local first, then Supabase
  let data = await readFileFromLocal(bucket, objectPath);
  if (!data && supabase) {
    data = await readFileFromSupabase(bucket, objectPath);
  }
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// MIME Type Detection
// ─────────────────────────────────────────────────────────────────────────────

function getMimeType(filename: string, metadata?: { mimetype?: string }): string {
  if (metadata?.mimetype) return metadata.mimetype;

  const ext = path.extname(filename).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.txt': 'text/plain',
    '.json': 'application/json',
  };
  return mimeMap[ext] || 'application/octet-stream';
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Migration
// ─────────────────────────────────────────────────────────────────────────────

async function migrateFile(
  obj: StorageObject,
  config: BucketConfig
): Promise<{ success: boolean; fileId?: string; error?: string }> {
  const objectPath = obj.name;
  const filename = path.basename(objectPath);
  const context = extractContext(config, objectPath, obj.owner);
  const category = inferCategory(config, objectPath, filename, obj.metadata);
  const mimeType = getMimeType(filename, obj.metadata);
  const size = obj.metadata?.size || 0;
  const fileId = isUuidLike(obj.id) ? obj.id : null;

  // Check if file already exists (by name and category)
  if (skipExisting) {
    const existing = fileId
      ? await prisma.file.findUnique({ where: { id: fileId } })
      : await prisma.file.findFirst({
          where: {
            name: filename,
            category,
          },
        });
    if (existing) {
      if (!dryRun) {
        await wireRelations(existing.id, category, context);
      }
      return { success: true, fileId: existing.id, error: 'skipped (exists)' };
    }
  }

  // Read file data
  const data = await readFile(config.name, objectPath);
  if (!data) {
    return { success: false, error: 'File not found locally or in Supabase' };
  }

  const uploadedBy = context.userId;
  const interviewId = context.interviewId;
  const jobApplicationId = context.jobApplicationId;
  const finalSize = size || data.length;

  if (dryRun) {
    return { success: true, fileId: 'dry-run' };
  }

  // Create file record
  try {
    const dataPayload: Record<string, unknown> = {
      name: filename,
      mimeType,
      size: finalSize,
      category,
      uploadedBy,
      interviewId,
      jobApplicationId,
      data,
    };

    if (fileId) {
      dataPayload.id = fileId;
    }

    const file = await prisma.file.create({ data: dataPayload });
    await wireRelations(file.id, category, context);
    return { success: true, fileId: file.id };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

async function wireRelations(
  fileId: string,
  category: FileCategory,
  context: { userId: string | null; interviewId: string | null; jobApplicationId: string | null }
): Promise<void> {
  if (category === 'LOGO' && context.userId) {
    await prisma.recruiterProfile.updateMany({
      where: { userId: context.userId, logoFileId: null },
      data: { logoFileId: fileId },
    });
  }

  if (category === 'RESUME') {
    if (context.userId) {
      await prisma.candidateProfile.updateMany({
        where: { userId: context.userId, resumeFileId: null },
        data: { resumeFileId: fileId },
      });
    }

    if (context.interviewId) {
      await prisma.interview.updateMany({
        where: { id: context.interviewId, candidateResumeFileId: null },
        data: { candidateResumeFileId: fileId },
      });
    }

    if (context.jobApplicationId) {
      await prisma.jobApplication.updateMany({
        where: { id: context.jobApplicationId, resumeFileId: null },
        data: { resumeFileId: fileId },
      });
    }
  }
}

async function main() {
  console.log('=== VantaHire Migration: Migrate Files ===');
  console.log(`Input: ${INPUT_DIR}`);
  console.log(`Mode:  ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Skip existing: ${skipExisting}`);
  if (specificBucket) {
    console.log(`Bucket filter: ${specificBucket}`);
  }
  console.log('');

  // Read storage objects metadata
  const storageObjects = readStorageObjects();
  console.log(`Found ${storageObjects.length} storage objects in metadata`);
  console.log('');

  // Filter to relevant buckets
  const buckets = specificBucket
    ? BUCKET_CONFIGS.filter((b) => b.name === specificBucket)
    : BUCKET_CONFIGS;

  const results = {
    total: 0,
    success: 0,
    skipped: 0,
    failed: 0,
  };

  for (const config of buckets) {
    const bucketObjects = storageObjects.filter((o) => o.bucket_id === config.name);
    console.log(`Bucket: ${config.name} (${bucketObjects.length} objects, default category: ${config.category})`);

    if (bucketObjects.length === 0) {
      // Try to scan local directory if no metadata
      const localBucketDir = path.join(BUCKETS_DIR, config.name);
      if (fs.existsSync(localBucketDir)) {
        console.log(`  Scanning local directory: ${localBucketDir}`);
        const files = scanLocalDirectory(localBucketDir, '');
        for (const filePath of files) {
          results.total++;
          const syntheticObj: StorageObject = {
            id: filePath,
            bucket_id: config.name,
            name: filePath,
          };

          const result = await migrateFile(syntheticObj, config);
          if (result.success) {
            if (result.error === 'skipped (exists)') {
              results.skipped++;
              console.log(`  [SKIP] ${filePath}`);
            } else {
              results.success++;
              console.log(`  [OK]   ${filePath} -> ${result.fileId}`);
            }
          } else {
            results.failed++;
            console.log(`  [FAIL] ${filePath}: ${result.error}`);
          }
        }
      }
      continue;
    }

    for (const obj of bucketObjects) {
      results.total++;
      const result = await migrateFile(obj, config);

      if (result.success) {
        if (result.error === 'skipped (exists)') {
          results.skipped++;
          console.log(`  [SKIP] ${obj.name}`);
        } else {
          results.success++;
          console.log(`  [OK]   ${obj.name} -> ${result.fileId}`);
        }
      } else {
        results.failed++;
        console.log(`  [FAIL] ${obj.name}: ${result.error}`);
      }
    }

    console.log('');
  }

  // Summary
  console.log('=== Summary ===');
  console.log(`Total:   ${results.total}`);
  console.log(`Success: ${results.success}`);
  console.log(`Skipped: ${results.skipped}`);
  console.log(`Failed:  ${results.failed}`);
  console.log('');

  if (dryRun) {
    console.log('This was a dry run. Run without --dry-run to migrate files.');
  }

  await prisma.$disconnect();
}

function scanLocalDirectory(baseDir: string, relativePath: string): string[] {
  const results: string[] = [];
  const fullPath = path.join(baseDir, relativePath);

  if (!fs.existsSync(fullPath)) return results;

  const entries = fs.readdirSync(fullPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...scanLocalDirectory(baseDir, entryPath));
    } else {
      results.push(entryPath);
    }
  }
  return results;
}

main().catch(async (err) => {
  console.error('Migration failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
