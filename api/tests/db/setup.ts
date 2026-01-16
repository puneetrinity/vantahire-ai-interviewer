/**
 * DB Integration Test Setup
 *
 * These tests run against a real database (Postgres).
 * Prerequisites:
 *   - DATABASE_URL set to test database
 *   - Run: npx prisma migrate deploy && npx tsx prisma/seed.ts
 */

import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

// Re-export test IDs from seed for use in tests
export const TEST_IDS = {
  recruiter: '00000000-0000-4000-8000-000000000001',
  candidate: '00000000-0000-4000-8000-000000000002',
  admin: '00000000-0000-4000-8000-000000000003',
  recruiterProfile: '00000000-0000-4000-8000-000000000011',
  candidateProfile: '00000000-0000-4000-8000-000000000012',
  job1: '00000000-0000-4000-8000-000000000021',
  job2: '00000000-0000-4000-8000-000000000022',
  interview1: '00000000-0000-4000-8000-000000000031',
  interview2: '00000000-0000-4000-8000-000000000032',
  session1: '00000000-0000-4000-8000-000000000041',
  session2: '00000000-0000-4000-8000-000000000042',
  application1: '00000000-0000-4000-8000-000000000051',
  file1: '00000000-0000-4000-8000-000000000061',
};

export async function setupDbTests() {
  // Verify connection
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    throw new Error(
      'Database connection failed. Ensure DATABASE_URL is set and the database is running.\n' +
      'Run: npx prisma migrate deploy && npx tsx prisma/seed.ts'
    );
  }

  // Verify seed data exists
  const userCount = await prisma.user.count();
  if (userCount === 0) {
    throw new Error(
      'No seed data found. Run: npx tsx prisma/seed.ts'
    );
  }
}

export async function teardownDbTests() {
  await prisma.$disconnect();
}

// Helper to create a test session in Redis (mock for now)
export function createTestSession(userId: string, role: 'RECRUITER' | 'CANDIDATE' | 'ADMIN') {
  return {
    userId,
    role,
    email: `${role.toLowerCase()}@test.com`,
    createdAt: Date.now(),
  };
}
