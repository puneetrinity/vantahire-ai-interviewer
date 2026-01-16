/**
 * DB Integration Tests: Users
 *
 * Run with: npm run test:db
 * Requires: DATABASE_URL and seeded database
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { prisma, TEST_IDS, setupDbTests, teardownDbTests } from './setup.js';

describe('Users DB Integration', () => {
  beforeAll(async () => {
    await setupDbTests();
  });

  afterAll(async () => {
    await teardownDbTests();
  });

  describe('User Queries', () => {
    it('should find user by id', async () => {
      const user = await prisma.user.findUnique({
        where: { id: TEST_IDS.recruiter },
      });

      expect(user).not.toBeNull();
      expect(user?.email).toBe('recruiter@test.com');
      expect(user?.role).toBe('RECRUITER');
    });

    it('should find user by email', async () => {
      const user = await prisma.user.findUnique({
        where: { email: 'candidate@test.com' },
      });

      expect(user).not.toBeNull();
      expect(user?.id).toBe(TEST_IDS.candidate);
      expect(user?.role).toBe('CANDIDATE');
    });

    it('should include recruiter profile relation', async () => {
      const user = await prisma.user.findUnique({
        where: { id: TEST_IDS.recruiter },
        include: { recruiterProfile: true },
      });

      expect(user?.recruiterProfile).not.toBeNull();
      expect(user?.recruiterProfile?.companyName).toBe('Test Company Inc.');
    });

    it('should include candidate profile relation', async () => {
      const user = await prisma.user.findUnique({
        where: { id: TEST_IDS.candidate },
        include: { candidateProfile: true },
      });

      expect(user?.candidateProfile).not.toBeNull();
      expect(user?.candidateProfile?.skills).toContain('TypeScript');
    });
  });

  describe('User CRUD', () => {
    const tempUserId = '00000000-0000-4000-8000-000000009999';

    afterAll(async () => {
      // Cleanup temp user
      await prisma.user.deleteMany({ where: { id: tempUserId } });
    });

    it('should create a new user', async () => {
      const user = await prisma.user.create({
        data: {
          id: tempUserId,
          email: 'temp-test@example.com',
          role: 'CANDIDATE',
          provider: 'test',
          providerId: 'temp-test-1',
          fullName: 'Temp Test User',
        },
      });

      expect(user.id).toBe(tempUserId);
      expect(user.email).toBe('temp-test@example.com');
    });

    it('should update user', async () => {
      const updated = await prisma.user.update({
        where: { id: tempUserId },
        data: { fullName: 'Updated Name' },
      });

      expect(updated.fullName).toBe('Updated Name');
    });

    it('should enforce unique email constraint', async () => {
      await expect(
        prisma.user.create({
          data: {
            email: 'recruiter@test.com', // Already exists
            role: 'CANDIDATE',
            provider: 'test',
            providerId: 'duplicate-test',
          },
        })
      ).rejects.toThrow();
    });
  });
});
