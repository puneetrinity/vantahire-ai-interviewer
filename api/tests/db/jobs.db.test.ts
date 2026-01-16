/**
 * DB Integration Tests: Jobs
 *
 * Run with: npm run test:db
 * Requires: DATABASE_URL and seeded database
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { prisma, TEST_IDS, setupDbTests, teardownDbTests } from './setup.js';

describe('Jobs DB Integration', () => {
  beforeAll(async () => {
    await setupDbTests();
  });

  afterAll(async () => {
    await teardownDbTests();
  });

  describe('Job Queries', () => {
    it('should find job by id', async () => {
      const job = await prisma.job.findUnique({
        where: { id: TEST_IDS.job1 },
      });

      expect(job).not.toBeNull();
      expect(job?.title).toBe('Senior Software Engineer');
      expect(job?.status).toBe('ACTIVE');
    });

    it('should filter jobs by status', async () => {
      const activeJobs = await prisma.job.findMany({
        where: { status: 'ACTIVE' },
      });

      expect(activeJobs.length).toBeGreaterThan(0);
      expect(activeJobs.every(j => j.status === 'ACTIVE')).toBe(true);
    });

    it('should filter jobs by recruiter', async () => {
      const recruiterJobs = await prisma.job.findMany({
        where: { recruiterId: TEST_IDS.recruiter },
      });

      expect(recruiterJobs.length).toBe(2);
    });

    it('should include recruiter relation', async () => {
      const job = await prisma.job.findUnique({
        where: { id: TEST_IDS.job1 },
        include: { recruiter: true },
      });

      expect(job?.recruiter).not.toBeNull();
      expect(job?.recruiter.email).toBe('recruiter@test.com');
    });

    it('should filter pending approval jobs', async () => {
      const pendingJobs = await prisma.job.findMany({
        where: { approvalStatus: 'PENDING' },
      });

      expect(pendingJobs.length).toBeGreaterThan(0);
      expect(pendingJobs[0].status).toBe('DRAFT');
    });
  });

  describe('Job Status Transitions', () => {
    it('should update job status', async () => {
      // First set to DRAFT
      await prisma.job.update({
        where: { id: TEST_IDS.job1 },
        data: { status: 'DRAFT' },
      });

      // Then set to ACTIVE
      const updated = await prisma.job.update({
        where: { id: TEST_IDS.job1 },
        data: { status: 'ACTIVE' },
      });

      expect(updated.status).toBe('ACTIVE');
    });

    it('should update approval status', async () => {
      const updated = await prisma.job.update({
        where: { id: TEST_IDS.job2 },
        data: {
          approvalStatus: 'APPROVED',
          approvedAt: new Date(),
          approvedBy: TEST_IDS.admin,
        },
      });

      expect(updated.approvalStatus).toBe('APPROVED');
      expect(updated.approvedBy).toBe(TEST_IDS.admin);

      // Reset for other tests
      await prisma.job.update({
        where: { id: TEST_IDS.job2 },
        data: {
          approvalStatus: 'PENDING',
          approvedAt: null,
          approvedBy: null,
        },
      });
    });
  });

  describe('Job Applications Relation', () => {
    it('should count applications for job', async () => {
      const job = await prisma.job.findUnique({
        where: { id: TEST_IDS.job1 },
        include: { _count: { select: { applications: true } } },
      });

      expect(job?._count.applications).toBeGreaterThanOrEqual(1);
    });

    it('should include applications with details', async () => {
      const job = await prisma.job.findUnique({
        where: { id: TEST_IDS.job1 },
        include: {
          applications: true,
        },
      });

      expect(job?.applications.length).toBeGreaterThanOrEqual(1);
      expect(job?.applications[0].candidateId).toBeTruthy();
    });
  });
});
