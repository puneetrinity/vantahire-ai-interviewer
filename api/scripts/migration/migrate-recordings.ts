#!/usr/bin/env npx tsx
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * VantaHire Migration: Migrate Recordings from Supabase Storage to GCS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Uploads recording files from Supabase storage to Google Cloud Storage
 * and updates Interview.recordingGcsKey for each interview.
 *
 * Prerequisites:
 *   1. Download recordings bucket using Supabase CLI:
 *      supabase storage download -b recordings -o ./migration_data/buckets/recordings
 *
 *   2. Configure GCS credentials:
 *      export GCS_PROJECT_ID="your-project"
 *      export GCS_BUCKET="your-bucket"
 *      export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"
 *
 * Usage:
 *   DATABASE_URL="postgres://..." npx tsx scripts/migration/migrate-recordings.ts --in ./migration_data
 *
 * Options:
 *   --dry-run              Show what would be done without making changes
 *   --skip-existing        Skip interviews that already have recordingGcsKey
 */

import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { Storage } from '@google-cloud/storage';
import { createClient } from '@supabase/supabase-js';

const prisma = new PrismaClient();

// ─────────────────────────────────────────────────────────────────────────────
// CLI Args
// ─────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const inputDirIndex = args.indexOf('--in');
const dryRun = args.includes('--dry-run');
const skipExisting = args.includes('--skip-existing');

if (inputDirIndex === -1) {
  console.error('Usage: npx tsx migrate-recordings.ts --in <input_dir> [--dry-run] [--skip-existing]');
  process.exit(1);
}

const INPUT_DIR = args[inputDirIndex + 1];
const RECORDINGS_DIR = path.join(INPUT_DIR, 'buckets', 'recordings');

// GCS Configuration
const GCS_PROJECT_ID = process.env.GCS_PROJECT_ID;
const GCS_BUCKET = process.env.GCS_BUCKET;

// Supabase client for direct downloads (optional)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

let storage: Storage | null = null;

function getStorage(): Storage {
  if (!storage) {
    if (!GCS_PROJECT_ID) {
      throw new Error('GCS_PROJECT_ID not configured');
    }
    storage = new Storage({ projectId: GCS_PROJECT_ID });
  }
  return storage;
}

function getBucket() {
  if (!GCS_BUCKET) {
    throw new Error('GCS_BUCKET not configured');
  }
  return getStorage().bucket(GCS_BUCKET);
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
  metadata?: {
    mimetype?: string;
    size?: number;
    [key: string]: unknown;
  };
}

function readStorageObjects(): StorageObject[] {
  const filepath = path.join(INPUT_DIR, 'storage_objects.json');
  if (!fs.existsSync(filepath)) {
    return [];
  }
  const content = fs.readFileSync(filepath, 'utf-8').trim();
  if (!content || content === 'null') {
    return [];
  }
  return JSON.parse(content);
}

// ─────────────────────────────────────────────────────────────────────────────
// File Reading
// ─────────────────────────────────────────────────────────────────────────────

async function readRecordingFromLocal(objectPath: string): Promise<Buffer | null> {
  const localPath = path.join(RECORDINGS_DIR, objectPath);
  if (fs.existsSync(localPath)) {
    return fs.readFileSync(localPath);
  }
  return null;
}

async function readRecordingFromSupabase(objectPath: string): Promise<Buffer | null> {
  if (!supabase) return null;

  try {
    const { data, error } = await supabase.storage
      .from('recordings')
      .download(objectPath);

    if (error || !data) {
      console.warn(`  Warning: Failed to download recordings/${objectPath}: ${error?.message}`);
      return null;
    }

    return Buffer.from(await data.arrayBuffer());
  } catch (err) {
    console.warn(`  Warning: Failed to download recordings/${objectPath}: ${err}`);
    return null;
  }
}

async function readRecording(objectPath: string): Promise<Buffer | null> {
  let data = await readRecordingFromLocal(objectPath);
  if (!data && supabase) {
    data = await readRecordingFromSupabase(objectPath);
  }
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Migration
// ─────────────────────────────────────────────────────────────────────────────

interface RecordingMapping {
  interviewId: string;
  supabasePath: string;
  gcsKey?: string;
}

async function uploadToGCS(
  buffer: Buffer,
  gcsKey: string,
  contentType: string = 'video/webm'
): Promise<void> {
  const bucket = getBucket();
  const file = bucket.file(gcsKey);

  await file.save(buffer, {
    contentType,
    metadata: {
      cacheControl: 'private, max-age=0',
    },
  });
}

function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.webm': 'video/webm',
    '.mp4': 'video/mp4',
    '.ogg': 'video/ogg',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
  };
  return mimeMap[ext] || 'video/webm';
}

async function main() {
  console.log('=== VantaHire Migration: Migrate Recordings to GCS ===');
  console.log(`Input: ${INPUT_DIR}`);
  console.log(`Mode:  ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Skip existing: ${skipExisting}`);
  console.log('');

  // Check GCS configuration
  if (!GCS_PROJECT_ID || !GCS_BUCKET) {
    console.error('Error: GCS_PROJECT_ID and GCS_BUCKET must be set');
    console.error('');
    console.error('Usage:');
    console.error('  export GCS_PROJECT_ID="your-project"');
    console.error('  export GCS_BUCKET="your-bucket"');
    console.error('  export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"');
    process.exit(1);
  }

  console.log(`GCS Project: ${GCS_PROJECT_ID}`);
  console.log(`GCS Bucket:  ${GCS_BUCKET}`);
  console.log('');

  // Read storage objects metadata to find recordings
  const storageObjects = readStorageObjects();
  const recordingObjects = storageObjects.filter((o) => o.bucket_id === 'recordings');
  console.log(`Found ${recordingObjects.length} recordings in storage_objects.json`);

  // Build mapping: extract interview_id from path
  // Expected path format: recordings/{interview_id}/{filename} or {interview_id}/{filename}
  const recordingMappings: RecordingMapping[] = [];

  for (const obj of recordingObjects) {
    // Try to extract interview_id from path
    const pathMatch = obj.name.match(/^(?:recordings\/)?([^/]+)\/(.+)$/);
    if (pathMatch) {
      const interviewId = pathMatch[1];
      recordingMappings.push({
        interviewId,
        supabasePath: obj.name,
      });
    }
  }

  // If no metadata, scan local directory
  if (recordingMappings.length === 0 && fs.existsSync(RECORDINGS_DIR)) {
    console.log('No metadata found, scanning local recordings directory...');
    const entries = fs.readdirSync(RECORDINGS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const interviewId = entry.name;
        const interviewDir = path.join(RECORDINGS_DIR, interviewId);
        const files = fs.readdirSync(interviewDir);
        for (const file of files) {
          recordingMappings.push({
            interviewId,
            supabasePath: `${interviewId}/${file}`,
          });
        }
      }
    }
  }

  console.log(`Found ${recordingMappings.length} recordings to migrate`);
  console.log('');

  if (recordingMappings.length === 0) {
    console.log('No recordings to migrate.');
    await prisma.$disconnect();
    return;
  }

  const results = {
    total: recordingMappings.length,
    success: 0,
    skipped: 0,
    failed: 0,
    notFound: 0,
  };

  for (const mapping of recordingMappings) {
    console.log(`Processing: ${mapping.supabasePath}`);

    // Check if interview exists
    const interview = await prisma.interview.findUnique({
      where: { id: mapping.interviewId },
      select: { id: true, recordingGcsKey: true },
    });

    if (!interview) {
      console.log(`  [SKIP] Interview ${mapping.interviewId} not found in database`);
      results.notFound++;
      continue;
    }

    // Skip if already has recording
    if (skipExisting && interview.recordingGcsKey) {
      console.log(`  [SKIP] Already has GCS key: ${interview.recordingGcsKey}`);
      results.skipped++;
      continue;
    }

    // Read recording file
    const data = await readRecording(mapping.supabasePath);
    if (!data) {
      console.log(`  [FAIL] Recording file not found`);
      results.failed++;
      continue;
    }

    // Generate GCS key
    const filename = path.basename(mapping.supabasePath);
    const timestamp = Date.now();
    const gcsKey = `recordings/${mapping.interviewId}/${timestamp}-${filename}`;
    const contentType = getMimeType(filename);

    if (dryRun) {
      console.log(`  [DRY]  Would upload ${data.length} bytes to ${gcsKey}`);
      results.success++;
      continue;
    }

    try {
      // Upload to GCS
      await uploadToGCS(data, gcsKey, contentType);

      // Update interview with GCS key
      await prisma.interview.update({
        where: { id: mapping.interviewId },
        data: { recordingGcsKey: gcsKey },
      });

      console.log(`  [OK]   Uploaded to ${gcsKey}`);
      results.success++;
    } catch (err) {
      console.log(`  [FAIL] ${err}`);
      results.failed++;
    }
  }

  // Summary
  console.log('');
  console.log('=== Summary ===');
  console.log(`Total:     ${results.total}`);
  console.log(`Success:   ${results.success}`);
  console.log(`Skipped:   ${results.skipped}`);
  console.log(`Not Found: ${results.notFound}`);
  console.log(`Failed:    ${results.failed}`);
  console.log('');

  if (dryRun) {
    console.log('This was a dry run. Run without --dry-run to migrate recordings.');
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Migration failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
