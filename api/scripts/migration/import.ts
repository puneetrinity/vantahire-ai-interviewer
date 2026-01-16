#!/usr/bin/env npx tsx
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * VantaHire Migration: Import Transformed Data to Railway Postgres
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Imports transformed JSON data into the Railway Postgres database using Prisma.
 * Data is imported in dependency order to satisfy foreign key constraints.
 *
 * Usage:
 *   DATABASE_URL="postgres://..." npx tsx scripts/migration/import.ts --in ./migration_data/transformed
 *
 * Options:
 *   --dry-run    Validate data without importing
 *   --skip-existing  Skip records that already exist (upsert behavior)
 */

import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─────────────────────────────────────────────────────────────────────────────
// CLI Args
// ─────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const inputDirIndex = args.indexOf('--in');
const dryRun = args.includes('--dry-run');
const skipExisting = args.includes('--skip-existing');

if (inputDirIndex === -1) {
  console.error('Usage: npx tsx import.ts --in <input_dir> [--dry-run] [--skip-existing]');
  process.exit(1);
}

const INPUT_DIR = args[inputDirIndex + 1];

// ─────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────────────────────

function readJsonFile(filename: string): unknown[] {
  const filepath = path.join(INPUT_DIR, filename);
  if (!fs.existsSync(filepath)) {
    console.log(`  Skipping ${filename} (not found)`);
    return [];
  }
  const content = fs.readFileSync(filepath, 'utf-8').trim();
  if (!content || content === 'null') {
    console.log(`  Skipping ${filename} (empty)`);
    return [];
  }
  return JSON.parse(content);
}

// ─────────────────────────────────────────────────────────────────────────────
// Import Functions (in dependency order)
// ─────────────────────────────────────────────────────────────────────────────

async function importUsers() {
  const records = readJsonFile('User.json') as Array<{
    id: string;
    email: string;
    role: string;
    provider: string;
    providerId: string;
    fullName?: string;
    avatarUrl?: string;
    createdAt: string;
    updatedAt: string;
  }>;

  if (records.length === 0) return;
  console.log(`  Importing ${records.length} users...`);

  if (dryRun) return;

  for (const record of records) {
    try {
      if (skipExisting) {
        await prisma.user.upsert({
          where: { id: record.id },
          create: {
            id: record.id,
            email: record.email,
            role: record.role as 'RECRUITER' | 'CANDIDATE' | 'ADMIN',
            provider: record.provider,
            providerId: record.providerId,
            fullName: record.fullName,
            avatarUrl: record.avatarUrl,
            createdAt: new Date(record.createdAt),
            updatedAt: new Date(record.updatedAt),
          },
          update: {},
        });
      } else {
        await prisma.user.create({
          data: {
            id: record.id,
            email: record.email,
            role: record.role as 'RECRUITER' | 'CANDIDATE' | 'ADMIN',
            provider: record.provider,
            providerId: record.providerId,
            fullName: record.fullName,
            avatarUrl: record.avatarUrl,
            createdAt: new Date(record.createdAt),
            updatedAt: new Date(record.updatedAt),
          },
        });
      }
    } catch (err) {
      console.error(`    Failed to import user ${record.id}:`, err);
    }
  }
}

async function importRecruiterProfiles() {
  const records = readJsonFile('RecruiterProfile.json') as Array<{
    id: string;
    userId: string;
    companyName?: string;
    logoFileId?: string;
    brandColor?: string;
    emailIntro?: string;
    emailTips?: string;
    emailCtaText?: string;
    subscriptionStatus: string;
    subscriptionUpdatedAt?: string;
    createdAt: string;
    updatedAt: string;
  }>;

  if (records.length === 0) return;
  console.log(`  Importing ${records.length} recruiter profiles...`);

  if (dryRun) return;

  for (const record of records) {
    try {
      if (skipExisting) {
        await prisma.recruiterProfile.upsert({
          where: { id: record.id },
          create: {
            id: record.id,
            userId: record.userId,
            companyName: record.companyName,
            brandColor: record.brandColor,
            emailIntro: record.emailIntro,
            emailTips: record.emailTips,
            emailCtaText: record.emailCtaText,
            subscriptionStatus: record.subscriptionStatus as 'FREE' | 'PAID' | 'ENTERPRISE',
            subscriptionUpdatedAt: record.subscriptionUpdatedAt ? new Date(record.subscriptionUpdatedAt) : null,
            createdAt: new Date(record.createdAt),
            updatedAt: new Date(record.updatedAt),
          },
          update: {},
        });
      } else {
        await prisma.recruiterProfile.create({
          data: {
            id: record.id,
            userId: record.userId,
            companyName: record.companyName,
            brandColor: record.brandColor,
            emailIntro: record.emailIntro,
            emailTips: record.emailTips,
            emailCtaText: record.emailCtaText,
            subscriptionStatus: record.subscriptionStatus as 'FREE' | 'PAID' | 'ENTERPRISE',
            subscriptionUpdatedAt: record.subscriptionUpdatedAt ? new Date(record.subscriptionUpdatedAt) : null,
            createdAt: new Date(record.createdAt),
            updatedAt: new Date(record.updatedAt),
          },
        });
      }
    } catch (err) {
      console.error(`    Failed to import recruiter profile ${record.id}:`, err);
    }
  }
}

async function importCandidateProfiles() {
  const records = readJsonFile('CandidateProfile.json') as Array<{
    id: string;
    userId: string;
    fullName?: string;
    email?: string;
    phone?: string;
    bio?: string;
    skills?: string[];
    experienceYears?: number;
    resumeFileId?: string;
    linkedinUrl?: string;
    portfolioUrl?: string;
    createdAt: string;
    updatedAt: string;
  }>;

  if (records.length === 0) return;
  console.log(`  Importing ${records.length} candidate profiles...`);

  if (dryRun) return;

  for (const record of records) {
    try {
      if (skipExisting) {
        await prisma.candidateProfile.upsert({
          where: { id: record.id },
          create: {
            id: record.id,
            userId: record.userId,
            fullName: record.fullName,
            email: record.email,
            phone: record.phone,
            bio: record.bio,
            skills: record.skills || [],
            experienceYears: record.experienceYears,
            linkedinUrl: record.linkedinUrl,
            portfolioUrl: record.portfolioUrl,
            createdAt: new Date(record.createdAt),
            updatedAt: new Date(record.updatedAt),
          },
          update: {},
        });
      } else {
        await prisma.candidateProfile.create({
          data: {
            id: record.id,
            userId: record.userId,
            fullName: record.fullName,
            email: record.email,
            phone: record.phone,
            bio: record.bio,
            skills: record.skills || [],
            experienceYears: record.experienceYears,
            linkedinUrl: record.linkedinUrl,
            portfolioUrl: record.portfolioUrl,
            createdAt: new Date(record.createdAt),
            updatedAt: new Date(record.updatedAt),
          },
        });
      }
    } catch (err) {
      console.error(`    Failed to import candidate profile ${record.id}:`, err);
    }
  }
}

async function importJobs() {
  const records = readJsonFile('Job.json') as Array<{
    id: string;
    recruiterId: string;
    title: string;
    description?: string;
    department?: string;
    location?: string;
    jobType?: string;
    salaryRange?: string;
    status: string;
    approvalStatus: string;
    approvedAt?: string;
    approvedBy?: string;
    rejectionReason?: string;
    createdAt: string;
    updatedAt: string;
  }>;

  if (records.length === 0) return;
  console.log(`  Importing ${records.length} jobs...`);

  if (dryRun) return;

  for (const record of records) {
    try {
      if (skipExisting) {
        await prisma.job.upsert({
          where: { id: record.id },
          create: {
            id: record.id,
            recruiterId: record.recruiterId,
            title: record.title,
            description: record.description,
            department: record.department,
            location: record.location,
            jobType: record.jobType,
            salaryRange: record.salaryRange,
            status: record.status as 'DRAFT' | 'ACTIVE' | 'CLOSED',
            approvalStatus: record.approvalStatus as 'PENDING' | 'APPROVED' | 'REJECTED',
            approvedAt: record.approvedAt ? new Date(record.approvedAt) : null,
            approvedBy: record.approvedBy,
            rejectionReason: record.rejectionReason,
            createdAt: new Date(record.createdAt),
            updatedAt: new Date(record.updatedAt),
          },
          update: {},
        });
      } else {
        await prisma.job.create({
          data: {
            id: record.id,
            recruiterId: record.recruiterId,
            title: record.title,
            description: record.description,
            department: record.department,
            location: record.location,
            jobType: record.jobType,
            salaryRange: record.salaryRange,
            status: record.status as 'DRAFT' | 'ACTIVE' | 'CLOSED',
            approvalStatus: record.approvalStatus as 'PENDING' | 'APPROVED' | 'REJECTED',
            approvedAt: record.approvedAt ? new Date(record.approvedAt) : null,
            approvedBy: record.approvedBy,
            rejectionReason: record.rejectionReason,
            createdAt: new Date(record.createdAt),
            updatedAt: new Date(record.updatedAt),
          },
        });
      }
    } catch (err) {
      console.error(`    Failed to import job ${record.id}:`, err);
    }
  }
}

async function importInterviews() {
  const records = readJsonFile('Interview.json') as Array<{
    id: string;
    recruiterId: string;
    jobId?: string;
    candidateEmail: string;
    candidateName?: string;
    candidateNotes?: string;
    candidateResumeFileId?: string;
    candidateUserId?: string;
    jobRole: string;
    type: string;
    timeLimitMinutes: number;
    status: string;
    interviewUrl?: string;
    expiresAt?: string;
    startedAt?: string;
    completedAt?: string;
    score?: number;
    transcriptSummary?: string;
    recordingGcsKey?: string;
    createdAt: string;
    updatedAt: string;
  }>;

  if (records.length === 0) return;
  console.log(`  Importing ${records.length} interviews...`);

  if (dryRun) return;

  for (const record of records) {
    try {
      if (skipExisting) {
        await prisma.interview.upsert({
          where: { id: record.id },
          create: {
            id: record.id,
            recruiterId: record.recruiterId,
            jobId: record.jobId,
            candidateEmail: record.candidateEmail,
            candidateName: record.candidateName,
            candidateNotes: record.candidateNotes,
            candidateUserId: record.candidateUserId,
            jobRole: record.jobRole,
            type: record.type as 'TEXT' | 'VOICE',
            timeLimitMinutes: record.timeLimitMinutes,
            status: record.status as 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'EXPIRED',
            interviewUrl: record.interviewUrl,
            expiresAt: record.expiresAt ? new Date(record.expiresAt) : null,
            startedAt: record.startedAt ? new Date(record.startedAt) : null,
            completedAt: record.completedAt ? new Date(record.completedAt) : null,
            score: record.score,
            transcriptSummary: record.transcriptSummary,
            recordingGcsKey: record.recordingGcsKey,
            createdAt: new Date(record.createdAt),
            updatedAt: new Date(record.updatedAt),
          },
          update: {},
        });
      } else {
        await prisma.interview.create({
          data: {
            id: record.id,
            recruiterId: record.recruiterId,
            jobId: record.jobId,
            candidateEmail: record.candidateEmail,
            candidateName: record.candidateName,
            candidateNotes: record.candidateNotes,
            candidateUserId: record.candidateUserId,
            jobRole: record.jobRole,
            type: record.type as 'TEXT' | 'VOICE',
            timeLimitMinutes: record.timeLimitMinutes,
            status: record.status as 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'EXPIRED',
            interviewUrl: record.interviewUrl,
            expiresAt: record.expiresAt ? new Date(record.expiresAt) : null,
            startedAt: record.startedAt ? new Date(record.startedAt) : null,
            completedAt: record.completedAt ? new Date(record.completedAt) : null,
            score: record.score,
            transcriptSummary: record.transcriptSummary,
            recordingGcsKey: record.recordingGcsKey,
            createdAt: new Date(record.createdAt),
            updatedAt: new Date(record.updatedAt),
          },
        });
      }
    } catch (err) {
      console.error(`    Failed to import interview ${record.id}:`, err);
    }
  }
}

async function importInterviewMessages() {
  const records = readJsonFile('InterviewMessage.json') as Array<{
    id: string;
    interviewId: string;
    role: string;
    content: string;
    createdAt: string;
  }>;

  if (records.length === 0) return;
  console.log(`  Importing ${records.length} interview messages...`);

  if (dryRun) return;

  // Batch insert for performance
  const batchSize = 100;
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    try {
      if (skipExisting) {
        for (const record of batch) {
          await prisma.interviewMessage.upsert({
            where: { id: record.id },
            create: {
              id: record.id,
              interviewId: record.interviewId,
              role: record.role,
              content: record.content,
              createdAt: new Date(record.createdAt),
            },
            update: {},
          });
        }
      } else {
        await prisma.interviewMessage.createMany({
          data: batch.map((r) => ({
            id: r.id,
            interviewId: r.interviewId,
            role: r.role,
            content: r.content,
            createdAt: new Date(r.createdAt),
          })),
          skipDuplicates: true,
        });
      }
    } catch (err) {
      console.error(`    Failed to import batch at ${i}:`, err);
    }
  }
}

async function importJobApplications() {
  const records = readJsonFile('JobApplication.json') as Array<{
    id: string;
    jobId: string;
    candidateId: string;
    coverLetter?: string;
    resumeFileId?: string;
    notes?: string;
    status: string;
    reviewedAt?: string;
    appliedAt: string;
    updatedAt: string;
  }>;

  if (records.length === 0) return;
  console.log(`  Importing ${records.length} job applications...`);

  if (dryRun) return;

  for (const record of records) {
    try {
      if (skipExisting) {
        await prisma.jobApplication.upsert({
          where: { id: record.id },
          create: {
            id: record.id,
            jobId: record.jobId,
            candidateId: record.candidateId,
            coverLetter: record.coverLetter,
            notes: record.notes,
            status: record.status as 'PENDING' | 'REVIEWED' | 'SHORTLISTED' | 'REJECTED' | 'HIRED',
            reviewedAt: record.reviewedAt ? new Date(record.reviewedAt) : null,
            appliedAt: new Date(record.appliedAt),
            updatedAt: new Date(record.updatedAt),
          },
          update: {},
        });
      } else {
        await prisma.jobApplication.create({
          data: {
            id: record.id,
            jobId: record.jobId,
            candidateId: record.candidateId,
            coverLetter: record.coverLetter,
            notes: record.notes,
            status: record.status as 'PENDING' | 'REVIEWED' | 'SHORTLISTED' | 'REJECTED' | 'HIRED',
            reviewedAt: record.reviewedAt ? new Date(record.reviewedAt) : null,
            appliedAt: new Date(record.appliedAt),
            updatedAt: new Date(record.updatedAt),
          },
        });
      }
    } catch (err) {
      console.error(`    Failed to import job application ${record.id}:`, err);
    }
  }
}

async function importEmailMessages() {
  const records = readJsonFile('EmailMessage.json') as Array<{
    id: string;
    interviewId: string;
    recipientEmail: string;
    messageId?: string;
    status: string;
    sentAt?: string;
    deliveredAt?: string;
    openedAt?: string;
    bouncedAt?: string;
    failedAt?: string;
    errorMessage?: string;
    createdAt: string;
    updatedAt: string;
  }>;

  if (records.length === 0) return;
  console.log(`  Importing ${records.length} email messages...`);

  if (dryRun) return;

  for (const record of records) {
    try {
      if (skipExisting) {
        await prisma.emailMessage.upsert({
          where: { id: record.id },
          create: {
            id: record.id,
            interviewId: record.interviewId,
            recipientEmail: record.recipientEmail,
            messageId: record.messageId,
            status: record.status,
            sentAt: record.sentAt ? new Date(record.sentAt) : null,
            deliveredAt: record.deliveredAt ? new Date(record.deliveredAt) : null,
            openedAt: record.openedAt ? new Date(record.openedAt) : null,
            bouncedAt: record.bouncedAt ? new Date(record.bouncedAt) : null,
            failedAt: record.failedAt ? new Date(record.failedAt) : null,
            errorMessage: record.errorMessage,
            createdAt: new Date(record.createdAt),
            updatedAt: new Date(record.updatedAt),
          },
          update: {},
        });
      } else {
        await prisma.emailMessage.create({
          data: {
            id: record.id,
            interviewId: record.interviewId,
            recipientEmail: record.recipientEmail,
            messageId: record.messageId,
            status: record.status,
            sentAt: record.sentAt ? new Date(record.sentAt) : null,
            deliveredAt: record.deliveredAt ? new Date(record.deliveredAt) : null,
            openedAt: record.openedAt ? new Date(record.openedAt) : null,
            bouncedAt: record.bouncedAt ? new Date(record.bouncedAt) : null,
            failedAt: record.failedAt ? new Date(record.failedAt) : null,
            errorMessage: record.errorMessage,
            createdAt: new Date(record.createdAt),
            updatedAt: new Date(record.updatedAt),
          },
        });
      }
    } catch (err) {
      console.error(`    Failed to import email message ${record.id}:`, err);
    }
  }
}

async function importWhatsAppMessages() {
  const records = readJsonFile('WhatsAppMessage.json') as Array<{
    id: string;
    interviewId: string;
    candidatePhone: string;
    messageId?: string;
    status: string;
    sentAt?: string;
    deliveredAt?: string;
    readAt?: string;
    failedAt?: string;
    errorMessage?: string;
    createdAt: string;
    updatedAt: string;
  }>;

  if (records.length === 0) return;
  console.log(`  Importing ${records.length} WhatsApp messages...`);

  if (dryRun) return;

  for (const record of records) {
    try {
      if (skipExisting) {
        await prisma.whatsAppMessage.upsert({
          where: { id: record.id },
          create: {
            id: record.id,
            interviewId: record.interviewId,
            candidatePhone: record.candidatePhone,
            messageId: record.messageId,
            status: record.status,
            sentAt: record.sentAt ? new Date(record.sentAt) : null,
            deliveredAt: record.deliveredAt ? new Date(record.deliveredAt) : null,
            readAt: record.readAt ? new Date(record.readAt) : null,
            failedAt: record.failedAt ? new Date(record.failedAt) : null,
            errorMessage: record.errorMessage,
            createdAt: new Date(record.createdAt),
            updatedAt: new Date(record.updatedAt),
          },
          update: {},
        });
      } else {
        await prisma.whatsAppMessage.create({
          data: {
            id: record.id,
            interviewId: record.interviewId,
            candidatePhone: record.candidatePhone,
            messageId: record.messageId,
            status: record.status,
            sentAt: record.sentAt ? new Date(record.sentAt) : null,
            deliveredAt: record.deliveredAt ? new Date(record.deliveredAt) : null,
            readAt: record.readAt ? new Date(record.readAt) : null,
            failedAt: record.failedAt ? new Date(record.failedAt) : null,
            errorMessage: record.errorMessage,
            createdAt: new Date(record.createdAt),
            updatedAt: new Date(record.updatedAt),
          },
        });
      }
    } catch (err) {
      console.error(`    Failed to import WhatsApp message ${record.id}:`, err);
    }
  }
}

async function importAdminSettings() {
  const records = readJsonFile('AdminSettings.json') as Array<{
    id: string;
    secretSignupCode?: string;
    createdAt: string;
    updatedAt: string;
  }>;

  if (records.length === 0) return;
  console.log(`  Importing ${records.length} admin settings...`);

  if (dryRun) return;

  for (const record of records) {
    try {
      if (skipExisting) {
        await prisma.adminSettings.upsert({
          where: { id: record.id },
          create: {
            id: record.id,
            secretSignupCode: record.secretSignupCode,
            createdAt: new Date(record.createdAt),
            updatedAt: new Date(record.updatedAt),
          },
          update: {},
        });
      } else {
        await prisma.adminSettings.create({
          data: {
            id: record.id,
            secretSignupCode: record.secretSignupCode,
            createdAt: new Date(record.createdAt),
            updatedAt: new Date(record.updatedAt),
          },
        });
      }
    } catch (err) {
      console.error(`    Failed to import admin settings ${record.id}:`, err);
    }
  }
}

async function importOnboardingReminders() {
  const records = readJsonFile('OnboardingReminder.json') as Array<{
    id: string;
    userId: string;
    reminderType: string;
    tasksPending: string[];
    sentAt: string;
  }>;

  if (records.length === 0) return;
  console.log(`  Importing ${records.length} onboarding reminders...`);

  if (dryRun) return;

  for (const record of records) {
    try {
      if (skipExisting) {
        await prisma.onboardingReminder.upsert({
          where: { id: record.id },
          create: {
            id: record.id,
            userId: record.userId,
            reminderType: record.reminderType,
            tasksPending: record.tasksPending || [],
            sentAt: new Date(record.sentAt),
          },
          update: {},
        });
      } else {
        await prisma.onboardingReminder.create({
          data: {
            id: record.id,
            userId: record.userId,
            reminderType: record.reminderType,
            tasksPending: record.tasksPending || [],
            sentAt: new Date(record.sentAt),
          },
        });
      }
    } catch (err) {
      console.error(`    Failed to import onboarding reminder ${record.id}:`, err);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== VantaHire Migration: Import ===');
  console.log(`Input: ${INPUT_DIR}`);
  console.log(`Mode:  ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Skip existing: ${skipExisting}`);
  console.log('');

  if (!fs.existsSync(INPUT_DIR)) {
    console.error(`Input directory not found: ${INPUT_DIR}`);
    process.exit(1);
  }

  console.log('Importing tables (in dependency order)...');
  console.log('');

  // 1. Users (no dependencies)
  await importUsers();

  // 2. Profiles (depend on Users)
  await importRecruiterProfiles();
  await importCandidateProfiles();

  // 3. Jobs (depend on Users)
  await importJobs();

  // 4. Interviews (depend on Users, Jobs)
  await importInterviews();

  // 5. Interview Messages (depend on Interviews)
  await importInterviewMessages();

  // 6. Job Applications (depend on Jobs, Users)
  await importJobApplications();

  // 7. Messaging (depend on Interviews)
  await importEmailMessages();
  await importWhatsAppMessages();

  // 8. Admin
  await importAdminSettings();
  await importOnboardingReminders();

  console.log('');
  console.log('=== Import Complete ===');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Generate InterviewSession tokens:');
  console.log('     npx tsx scripts/migration/create-interview-sessions.ts');
  console.log('  2. Verify counts:');
  console.log('     npx tsx scripts/migration/verify.ts');

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Import failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
