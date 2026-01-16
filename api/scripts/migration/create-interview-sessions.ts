#!/usr/bin/env npx tsx
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * VantaHire Migration: Create InterviewSession Tokens
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Generates InterviewSession tokens for all existing interviews that don't
 * have an active session. Updates interview URLs with new tokens.
 *
 * Usage:
 *   DATABASE_URL="postgres://..." CLIENT_URL="https://..." npx tsx scripts/migration/create-interview-sessions.ts
 *
 * Options:
 *   --dry-run              Show what would be done without making changes
 *   --pending-only         Only create sessions for PENDING interviews
 *   --expiry-days <n>      Session expiry in days (default: 7)
 */

import { PrismaClient } from '@prisma/client';
import { nanoid } from 'nanoid';

const prisma = new PrismaClient();

// ─────────────────────────────────────────────────────────────────────────────
// CLI Args
// ─────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const pendingOnly = args.includes('--pending-only');
const expiryDaysIndex = args.indexOf('--expiry-days');
const expiryDays = expiryDaysIndex !== -1 ? parseInt(args[expiryDaysIndex + 1]) || 7 : 7;

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

interface InterviewWithSessions {
  id: string;
  candidateEmail: string;
  candidateName: string | null;
  status: string;
  interviewUrl: string | null;
  sessions: { id: string; revokedAt: Date | null; expiresAt: Date }[];
}

async function main() {
  console.log('=== VantaHire Migration: Create InterviewSession Tokens ===');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Filter: ${pendingOnly ? 'PENDING only' : 'All interviews'}`);
  console.log(`Session expiry: ${expiryDays} days`);
  console.log(`Client URL: ${CLIENT_URL}`);
  console.log('');

  // Find interviews that need sessions
  const whereClause: Record<string, unknown> = {};
  if (pendingOnly) {
    whereClause.status = 'PENDING';
  }

  const interviews = await prisma.interview.findMany({
    where: whereClause,
    select: {
      id: true,
      candidateEmail: true,
      candidateName: true,
      status: true,
      interviewUrl: true,
      sessions: {
        where: {
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: {
          id: true,
          revokedAt: true,
          expiresAt: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  }) as InterviewWithSessions[];

  console.log(`Found ${interviews.length} interviews total`);

  // Filter to those without active sessions
  const needsSession = interviews.filter((i) => i.sessions.length === 0);
  const alreadyHasSession = interviews.filter((i) => i.sessions.length > 0);

  console.log(`  - ${alreadyHasSession.length} already have active sessions`);
  console.log(`  - ${needsSession.length} need new sessions`);
  console.log('');

  if (needsSession.length === 0) {
    console.log('No interviews need new sessions. Done.');
    await prisma.$disconnect();
    return;
  }

  // Generate sessions
  const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);
  const results: Array<{
    interviewId: string;
    candidate: string;
    status: string;
    token: string;
    url: string;
  }> = [];

  console.log('Generating sessions...');
  console.log('');

  for (const interview of needsSession) {
    const token = nanoid(32);
    const interviewUrl = `${CLIENT_URL}/interview/${interview.id}?token=${token}`;

    if (!dryRun) {
      // Create session
      await prisma.interviewSession.create({
        data: {
          interviewId: interview.id,
          token,
          expiresAt,
        },
      });

      // Update interview URL
      await prisma.interview.update({
        where: { id: interview.id },
        data: { interviewUrl },
      });
    }

    results.push({
      interviewId: interview.id,
      candidate: interview.candidateName || interview.candidateEmail,
      status: interview.status,
      token,
      url: interviewUrl,
    });

    console.log(`  ${interview.candidateName || interview.candidateEmail} (${interview.status})`);
    console.log(`    ID:    ${interview.id}`);
    console.log(`    Token: ${token}`);
    console.log(`    URL:   ${interviewUrl}`);
    console.log('');
  }

  // Summary
  console.log('=== Summary ===');
  console.log(`Created ${results.length} new session${results.length === 1 ? '' : 's'}`);
  console.log(`Sessions expire: ${expiresAt.toISOString()}`);
  console.log('');

  // Output CSV for easy re-sending of invites
  if (!dryRun) {
    console.log('=== CSV Output (for re-sending invites) ===');
    console.log('interview_id,candidate,status,interview_url');
    for (const r of results) {
      console.log(`${r.interviewId},"${r.candidate}",${r.status},"${r.url}"`);
    }
  }

  console.log('');
  console.log('Next steps:');
  if (dryRun) {
    console.log('  Run without --dry-run to create the sessions');
  } else {
    console.log('  1. Review the CSV output above');
    console.log('  2. Re-send interview links to candidates with PENDING status');
    console.log('  3. Verify key flows work with new tokens');
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Failed to create interview sessions:', err);
  await prisma.$disconnect();
  process.exit(1);
});
