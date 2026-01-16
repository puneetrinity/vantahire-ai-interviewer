/**
 * DB Integration Tests: Interviews
 *
 * Run with: npm run test:db
 * Requires: DATABASE_URL and seeded database
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { prisma, TEST_IDS, setupDbTests, teardownDbTests } from './setup.js';

describe('Interviews DB Integration', () => {
  beforeAll(async () => {
    await setupDbTests();
  });

  afterAll(async () => {
    await teardownDbTests();
  });

  describe('Interview Queries', () => {
    it('should find interview by id', async () => {
      const interview = await prisma.interview.findUnique({
        where: { id: TEST_IDS.interview1 },
      });

      expect(interview).not.toBeNull();
      expect(interview?.candidateEmail).toBe('candidate@test.com');
      expect(interview?.type).toBe('TEXT');
    });

    it('should filter by status', async () => {
      const pendingInterviews = await prisma.interview.findMany({
        where: { status: 'PENDING' },
      });

      expect(pendingInterviews.length).toBeGreaterThan(0);
    });

    it('should filter by type', async () => {
      const voiceInterviews = await prisma.interview.findMany({
        where: { type: 'VOICE' },
      });

      expect(voiceInterviews.length).toBeGreaterThan(0);
      expect(voiceInterviews[0].type).toBe('VOICE');
    });

    it('should include recruiter relation', async () => {
      const interview = await prisma.interview.findUnique({
        where: { id: TEST_IDS.interview1 },
        include: { recruiter: true },
      });

      expect(interview?.recruiter).not.toBeNull();
      expect(interview?.recruiter.email).toBe('recruiter@test.com');
    });
  });

  describe('Interview Sessions', () => {
    it('should find session by interview id', async () => {
      const sessions = await prisma.interviewSession.findMany({
        where: { interviewId: TEST_IDS.interview1 },
      });

      expect(sessions.length).toBeGreaterThan(0);
    });

    it('should find valid (non-expired, non-revoked) session', async () => {
      const session = await prisma.interviewSession.findFirst({
        where: {
          interviewId: TEST_IDS.interview1,
          expiresAt: { gt: new Date() },
          revokedAt: null,
        },
      });

      expect(session).not.toBeNull();
    });

    it('should include interview relation', async () => {
      const session = await prisma.interviewSession.findUnique({
        where: { id: TEST_IDS.session1 },
        include: { interview: true },
      });

      expect(session?.interview).not.toBeNull();
      expect(session?.interview.id).toBe(TEST_IDS.interview1);
    });
  });

  describe('Interview Status Transitions', () => {
    it('should update interview status to IN_PROGRESS', async () => {
      const updated = await prisma.interview.update({
        where: { id: TEST_IDS.interview1 },
        data: {
          status: 'IN_PROGRESS',
          startedAt: new Date(),
        },
      });

      expect(updated.status).toBe('IN_PROGRESS');
      expect(updated.startedAt).not.toBeNull();

      // Reset for other tests
      await prisma.interview.update({
        where: { id: TEST_IDS.interview1 },
        data: { status: 'PENDING', startedAt: null },
      });
    });

    it('should complete interview with score', async () => {
      // First start it
      await prisma.interview.update({
        where: { id: TEST_IDS.interview1 },
        data: { status: 'IN_PROGRESS', startedAt: new Date() },
      });

      // Then complete it
      const updated = await prisma.interview.update({
        where: { id: TEST_IDS.interview1 },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          score: 85,
          transcriptSummary: 'Good performance overall.',
        },
      });

      expect(updated.status).toBe('COMPLETED');
      expect(updated.score).toBe(85);
      expect(updated.transcriptSummary).toBe('Good performance overall.');

      // Reset for other tests
      await prisma.interview.update({
        where: { id: TEST_IDS.interview1 },
        data: {
          status: 'PENDING',
          startedAt: null,
          completedAt: null,
          score: null,
          transcriptSummary: null,
        },
      });
    });
  });

  describe('Interview Messages', () => {
    const tempMessageId = '00000000-0000-4000-8000-000000008888';

    afterAll(async () => {
      await prisma.interviewMessage.deleteMany({ where: { id: tempMessageId } });
    });

    it('should create interview message', async () => {
      const message = await prisma.interviewMessage.create({
        data: {
          id: tempMessageId,
          interviewId: TEST_IDS.interview1,
          role: 'assistant',
          content: 'Hello, welcome to your interview!',
        },
      });

      expect(message.id).toBe(tempMessageId);
      expect(message.role).toBe('assistant');
    });

    it('should retrieve messages for interview', async () => {
      const messages = await prisma.interviewMessage.findMany({
        where: { interviewId: TEST_IDS.interview1 },
        orderBy: { createdAt: 'asc' },
      });

      expect(messages.length).toBeGreaterThan(0);
    });
  });
});
