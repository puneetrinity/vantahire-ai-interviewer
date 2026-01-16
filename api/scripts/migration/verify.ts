#!/usr/bin/env npx tsx
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * VantaHire Migration: Verify Data Import
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Runs verification queries to ensure data was imported correctly.
 * Compares counts with expected values from the source export.
 *
 * Usage:
 *   DATABASE_URL="postgres://..." npx tsx scripts/migration/verify.ts [--expected <path>]
 *
 * Options:
 *   --expected <path>    Path to row_counts.txt from export for comparison
 */

import fs from 'fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─────────────────────────────────────────────────────────────────────────────
// CLI Args
// ─────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const expectedIndex = args.indexOf('--expected');
const expectedPath = expectedIndex !== -1 ? args[expectedIndex + 1] : null;

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

interface CountResult {
  table: string;
  count: number;
  expected?: number;
  match?: boolean;
}

async function main() {
  console.log('=== VantaHire Migration: Verify ===');
  console.log('');

  // Parse expected counts if provided
  const expectedCounts: Record<string, number> = {};
  if (expectedPath && fs.existsSync(expectedPath)) {
    console.log(`Loading expected counts from: ${expectedPath}`);
    const content = fs.readFileSync(expectedPath, 'utf-8');
    for (const line of content.split('\n')) {
      const match = line.match(/^(\w+):\s*(\d+)/);
      if (match) {
        expectedCounts[match[1]] = parseInt(match[2]);
      }
    }
    console.log('');
  }

  // Get actual counts
  const results: CountResult[] = [];

  console.log('Table Counts:');
  console.log('─'.repeat(60));

  // User
  const userCount = await prisma.user.count();
  results.push({
    table: 'User',
    count: userCount,
    expected: expectedCounts['users'],
    match: expectedCounts['users'] === undefined || userCount === expectedCounts['users'],
  });

  // RecruiterProfile
  const recruiterProfileCount = await prisma.recruiterProfile.count();
  results.push({
    table: 'RecruiterProfile',
    count: recruiterProfileCount,
    expected: expectedCounts['profiles'],
    match: expectedCounts['profiles'] === undefined || recruiterProfileCount === expectedCounts['profiles'],
  });

  // CandidateProfile
  const candidateProfileCount = await prisma.candidateProfile.count();
  results.push({
    table: 'CandidateProfile',
    count: candidateProfileCount,
    expected: expectedCounts['candidate_profiles'],
    match: expectedCounts['candidate_profiles'] === undefined || candidateProfileCount === expectedCounts['candidate_profiles'],
  });

  // Job
  const jobCount = await prisma.job.count();
  results.push({
    table: 'Job',
    count: jobCount,
    expected: expectedCounts['jobs'],
    match: expectedCounts['jobs'] === undefined || jobCount === expectedCounts['jobs'],
  });

  // Interview
  const interviewCount = await prisma.interview.count();
  results.push({
    table: 'Interview',
    count: interviewCount,
    expected: expectedCounts['interviews'],
    match: expectedCounts['interviews'] === undefined || interviewCount === expectedCounts['interviews'],
  });

  // InterviewSession
  const interviewSessionCount = await prisma.interviewSession.count();
  results.push({
    table: 'InterviewSession',
    count: interviewSessionCount,
  });

  // InterviewMessage
  const interviewMessageCount = await prisma.interviewMessage.count();
  results.push({
    table: 'InterviewMessage',
    count: interviewMessageCount,
    expected: expectedCounts['interview_messages'],
    match: expectedCounts['interview_messages'] === undefined || interviewMessageCount === expectedCounts['interview_messages'],
  });

  // JobApplication
  const jobApplicationCount = await prisma.jobApplication.count();
  results.push({
    table: 'JobApplication',
    count: jobApplicationCount,
    expected: expectedCounts['job_applications'],
    match: expectedCounts['job_applications'] === undefined || jobApplicationCount === expectedCounts['job_applications'],
  });

  // EmailMessage
  const emailMessageCount = await prisma.emailMessage.count();
  results.push({
    table: 'EmailMessage',
    count: emailMessageCount,
    expected: expectedCounts['email_messages'],
    match: expectedCounts['email_messages'] === undefined || emailMessageCount === expectedCounts['email_messages'],
  });

  // WhatsAppMessage
  const whatsappMessageCount = await prisma.whatsAppMessage.count();
  results.push({
    table: 'WhatsAppMessage',
    count: whatsappMessageCount,
    expected: expectedCounts['whatsapp_messages'],
    match: expectedCounts['whatsapp_messages'] === undefined || whatsappMessageCount === expectedCounts['whatsapp_messages'],
  });

  // File
  const fileCount = await prisma.file.count();
  results.push({
    table: 'File',
    count: fileCount,
  });

  // ApiKey
  const apiKeyCount = await prisma.apiKey.count();
  results.push({
    table: 'ApiKey',
    count: apiKeyCount,
    expected: expectedCounts['api_keys'],
    match: expectedCounts['api_keys'] === undefined || apiKeyCount === expectedCounts['api_keys'],
  });

  // ApiUsageLog
  const apiUsageLogCount = await prisma.apiUsageLog.count();
  results.push({
    table: 'ApiUsageLog',
    count: apiUsageLogCount,
    expected: expectedCounts['api_usage_logs'],
    match: expectedCounts['api_usage_logs'] === undefined || apiUsageLogCount === expectedCounts['api_usage_logs'],
  });

  // AdminSettings
  const adminSettingsCount = await prisma.adminSettings.count();
  results.push({
    table: 'AdminSettings',
    count: adminSettingsCount,
    expected: expectedCounts['admin_settings'],
    match: expectedCounts['admin_settings'] === undefined || adminSettingsCount === expectedCounts['admin_settings'],
  });

  // OnboardingReminder
  const onboardingReminderCount = await prisma.onboardingReminder.count();
  results.push({
    table: 'OnboardingReminder',
    count: onboardingReminderCount,
    expected: expectedCounts['onboarding_reminders'],
    match: expectedCounts['onboarding_reminders'] === undefined || onboardingReminderCount === expectedCounts['onboarding_reminders'],
  });

  // Print results
  for (const r of results) {
    const status = r.expected !== undefined
      ? (r.match ? '✓' : '✗')
      : ' ';
    const expectedStr = r.expected !== undefined ? ` (expected: ${r.expected})` : '';
    console.log(`${status} ${r.table.padEnd(25)} ${r.count}${expectedStr}`);
  }

  console.log('─'.repeat(60));
  console.log('');

  // Additional verification queries
  console.log('Integrity Checks:');
  console.log('─'.repeat(60));

  // Orphaned interviews (no recruiter)
  const orphanedInterviews = await prisma.interview.count({
    where: {
      recruiter: null,
    },
  });
  console.log(`${orphanedInterviews === 0 ? '✓' : '✗'} Orphaned interviews: ${orphanedInterviews}`);

  // Interviews with sessions
  const interviewsWithSessions = await prisma.interview.count({
    where: {
      sessions: {
        some: {
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      },
    },
  });
  const pendingInterviews = await prisma.interview.count({
    where: { status: 'PENDING' },
  });
  console.log(`  Pending interviews: ${pendingInterviews}`);
  console.log(`  Interviews with active sessions: ${interviewsWithSessions}`);

  // Users by role
  const usersByRole = await prisma.user.groupBy({
    by: ['role'],
    _count: true,
  });
  console.log('');
  console.log('Users by role:');
  for (const r of usersByRole) {
    console.log(`  ${r.role}: ${r._count}`);
  }

  // Interviews by status
  const interviewsByStatus = await prisma.interview.groupBy({
    by: ['status'],
    _count: true,
  });
  console.log('');
  console.log('Interviews by status:');
  for (const r of interviewsByStatus) {
    console.log(`  ${r.status}: ${r._count}`);
  }

  // Jobs by status
  const jobsByStatus = await prisma.job.groupBy({
    by: ['status'],
    _count: true,
  });
  console.log('');
  console.log('Jobs by status:');
  for (const r of jobsByStatus) {
    console.log(`  ${r.status}: ${r._count}`);
  }

  console.log('');
  console.log('─'.repeat(60));

  // Summary
  const mismatches = results.filter((r) => r.match === false);
  if (mismatches.length > 0) {
    console.log(`⚠ ${mismatches.length} table(s) have count mismatches`);
    for (const m of mismatches) {
      console.log(`  - ${m.table}: got ${m.count}, expected ${m.expected}`);
    }
  } else if (Object.keys(expectedCounts).length > 0) {
    console.log('✓ All counts match expected values');
  } else {
    console.log('ℹ No expected counts provided. Run with --expected to compare.');
  }

  console.log('');
  console.log('=== Verification Complete ===');

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Verification failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
