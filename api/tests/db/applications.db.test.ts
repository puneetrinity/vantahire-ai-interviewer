/**
 * DB Integration Tests: Applications
 *
 * Run with: npm run test:db
 * Requires: DATABASE_URL and seeded database
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { prisma, TEST_IDS, setupDbTests, teardownDbTests } from './setup.js';

describe('Applications DB Integration', () => {
  beforeAll(async () => {
    await setupDbTests();
  });

  afterAll(async () => {
    await teardownDbTests();
  });

  describe('Application Queries', () => {
    it('should find application by id', async () => {
      const application = await prisma.jobApplication.findUnique({
        where: { id: TEST_IDS.application1 },
      });

      expect(application).not.toBeNull();
      expect(application?.status).toBe('PENDING');
    });

    it('should filter applications by status', async () => {
      const pendingApplications = await prisma.jobApplication.findMany({
        where: { status: 'PENDING' },
      });

      expect(pendingApplications.length).toBeGreaterThan(0);
      expect(pendingApplications.every(a => a.status === 'PENDING')).toBe(true);
    });

    it('should filter applications by job', async () => {
      const jobApplications = await prisma.jobApplication.findMany({
        where: { jobId: TEST_IDS.job1 },
      });

      expect(jobApplications.length).toBeGreaterThanOrEqual(1);
    });

    it('should filter applications by candidate', async () => {
      const candidateApplications = await prisma.jobApplication.findMany({
        where: { candidateId: TEST_IDS.candidate },
      });

      expect(candidateApplications.length).toBeGreaterThanOrEqual(1);
    });

    it('should include job relation', async () => {
      const application = await prisma.jobApplication.findUnique({
        where: { id: TEST_IDS.application1 },
        include: { job: true },
      });

      expect(application?.job).not.toBeNull();
      expect(application?.job.title).toBeTruthy();
    });
  });

  describe('Application Status Transitions', () => {
    it('should update status to REVIEWED', async () => {
      const updated = await prisma.jobApplication.update({
        where: { id: TEST_IDS.application1 },
        data: {
          status: 'REVIEWED',
          reviewedAt: new Date(),
        },
      });

      expect(updated.status).toBe('REVIEWED');
      expect(updated.reviewedAt).not.toBeNull();

      // Reset for other tests
      await prisma.jobApplication.update({
        where: { id: TEST_IDS.application1 },
        data: { status: 'PENDING', reviewedAt: null },
      });
    });

    it('should update status to SHORTLISTED', async () => {
      const updated = await prisma.jobApplication.update({
        where: { id: TEST_IDS.application1 },
        data: {
          status: 'SHORTLISTED',
          reviewedAt: new Date(),
        },
      });

      expect(updated.status).toBe('SHORTLISTED');

      // Reset for other tests
      await prisma.jobApplication.update({
        where: { id: TEST_IDS.application1 },
        data: { status: 'PENDING', reviewedAt: null },
      });
    });

    it('should update status to REJECTED', async () => {
      const updated = await prisma.jobApplication.update({
        where: { id: TEST_IDS.application1 },
        data: {
          status: 'REJECTED',
          reviewedAt: new Date(),
          notes: 'Not a good fit.',
        },
      });

      expect(updated.status).toBe('REJECTED');
      expect(updated.notes).toBe('Not a good fit.');

      // Reset for other tests
      await prisma.jobApplication.update({
        where: { id: TEST_IDS.application1 },
        data: { status: 'PENDING', reviewedAt: null, notes: null },
      });
    });

    it('should update status to HIRED', async () => {
      const updated = await prisma.jobApplication.update({
        where: { id: TEST_IDS.application1 },
        data: {
          status: 'HIRED',
          reviewedAt: new Date(),
        },
      });

      expect(updated.status).toBe('HIRED');

      // Reset for other tests
      await prisma.jobApplication.update({
        where: { id: TEST_IDS.application1 },
        data: { status: 'PENDING', reviewedAt: null },
      });
    });
  });

  describe('Application CRUD', () => {
    const tempAppId = '00000000-0000-4000-8000-000000009991';

    afterAll(async () => {
      await prisma.jobApplication.deleteMany({ where: { id: tempAppId } });
    });

    it('should create a new application', async () => {
      const application = await prisma.jobApplication.create({
        data: {
          id: tempAppId,
          jobId: TEST_IDS.job1,
          candidateId: TEST_IDS.candidate,
          coverLetter: 'I am very interested in this position.',
        },
      });

      expect(application.id).toBe(tempAppId);
      expect(application.status).toBe('PENDING');
      expect(application.coverLetter).toContain('interested');
    });

    it('should update application notes', async () => {
      const updated = await prisma.jobApplication.update({
        where: { id: tempAppId },
        data: {
          notes: 'Strong candidate, schedule interview.',
        },
      });

      expect(updated.notes).toBe('Strong candidate, schedule interview.');
    });

    it('should delete application', async () => {
      await prisma.jobApplication.delete({
        where: { id: tempAppId },
      });

      const deleted = await prisma.jobApplication.findUnique({
        where: { id: tempAppId },
      });

      expect(deleted).toBeNull();
    });
  });

  describe('Application Aggregations', () => {
    it('should count applications by status', async () => {
      const counts = await prisma.jobApplication.groupBy({
        by: ['status'],
        _count: true,
      });

      expect(counts.length).toBeGreaterThan(0);
      const pendingCount = counts.find(c => c.status === 'PENDING');
      expect(pendingCount?._count).toBeGreaterThanOrEqual(1);
    });

    it('should get applications with pagination', async () => {
      const page1 = await prisma.jobApplication.findMany({
        take: 10,
        skip: 0,
        orderBy: { appliedAt: 'desc' },
      });

      expect(page1.length).toBeGreaterThan(0);
      expect(page1.length).toBeLessThanOrEqual(10);
    });
  });
});
