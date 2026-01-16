import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';

const run = process.env.MIGRATION_VERIFY === '1';
const describeIf = run ? describe : describe.skip;

const prisma = new PrismaClient();
const expectedPath =
  process.env.MIGRATION_EXPECTED_PATH ||
  path.join(process.cwd(), 'migration_data', 'row_counts.txt');

type TableCounts = Record<string, number>;

function loadExpectedCounts(filePath: string): TableCounts {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const counts: TableCounts = {};
  for (const line of content.split('\n')) {
    const match = line.match(/^(\w+):\s*(\d+)/);
    if (match) {
      counts[match[1]] = parseInt(match[2], 10);
    }
  }
  return counts;
}

const expectedCounts = run ? loadExpectedCounts(expectedPath) : {};

const tableQueries: Record<string, () => Promise<number>> = {
  users: () => prisma.user.count(),
  profiles: () => prisma.recruiterProfile.count(),
  candidate_profiles: () => prisma.candidateProfile.count(),
  jobs: () => prisma.job.count(),
  interviews: () => prisma.interview.count(),
  interview_messages: () => prisma.interviewMessage.count(),
  job_applications: () => prisma.jobApplication.count(),
  email_messages: () => prisma.emailMessage.count(),
  whatsapp_messages: () => prisma.whatsAppMessage.count(),
  api_keys: () => prisma.apiKey.count(),
  api_usage_logs: () => prisma.apiUsageLog.count(),
  admin_settings: () => prisma.adminSettings.count(),
  onboarding_reminders: () => prisma.onboardingReminder.count(),
  files: () => prisma.file.count(),
};

describeIf('Migration Validation (DB)', () => {
  beforeAll(async () => {
    if (!run) return;
    if (Object.keys(expectedCounts).length === 0) {
      throw new Error(
        `Expected counts not found. Set MIGRATION_EXPECTED_PATH or ensure ${expectedPath} exists.`
      );
    }
    await prisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('loads expected counts', () => {
    expect(Object.keys(expectedCounts).length).toBeGreaterThan(0);
  });

  for (const [table, expected] of Object.entries(expectedCounts)) {
    const query = tableQueries[table];
    if (!query) continue;
    it(`matches ${table} count`, async () => {
      const actual = await query();
      expect(actual).toBe(expected);
    });
  }

  it('ensures interview URLs contain tokens when present', async () => {
    const interviews = await prisma.interview.findMany({
      where: { interviewUrl: { not: null } },
      select: { interviewUrl: true },
    });

    for (const interview of interviews) {
      expect(interview.interviewUrl).toContain('/interview/');
      expect(interview.interviewUrl).toContain('token=');
    }
  });

  it('ensures active interview sessions are not expired', async () => {
    const sessions = await prisma.interviewSession.findMany({
      where: { revokedAt: null },
      select: { expiresAt: true },
    });

    const now = Date.now();
    for (const session of sessions) {
      expect(new Date(session.expiresAt).getTime()).toBeGreaterThan(now);
    }
  });
});
