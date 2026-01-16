import { describe, expect, it, vi, beforeEach } from 'vitest';
import { app } from '../../src/app.js';
import type { Interview, InterviewSession, InterviewMessage } from '@prisma/client';
import { asMock, readJson } from '../helpers/mock.js';

// Mock Redis
vi.mock('../../src/lib/redis.js', () => ({
  redis: {
    setex: vi.fn(),
    get: vi.fn(),
    del: vi.fn(),
    exists: vi.fn(),
    expire: vi.fn(),
    ping: vi.fn().mockResolvedValue('PONG'),
    on: vi.fn(),
  },
  createSession: vi.fn(),
  getSession: vi.fn(),
  deleteSession: vi.fn(),
  refreshSession: vi.fn(),
}));

// Mock database
vi.mock('../../src/lib/db.js', () => ({
  db: {
    $queryRaw: vi.fn().mockResolvedValue([{ 1: 1 }]),
    $transaction: vi.fn((fn) => fn({
      interview: {
        create: vi.fn(),
        update: vi.fn(),
      },
      interviewSession: {
        create: vi.fn(),
      },
    })),
    interview: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    interviewSession: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    interviewMessage: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

// Mock socket
vi.mock('../../src/lib/socket.js', () => ({
  emitTo: {
    user: vi.fn(),
    interview: vi.fn(),
  },
  getIO: vi.fn(),
}));

// Mock email service
vi.mock('../../src/services/email/brevo.js', () => ({
  sendInterviewInvite: vi.fn(),
}));

// Mock WhatsApp service
vi.mock('../../src/services/whatsapp/meta.js', () => ({
  sendInterviewInviteWhatsApp: vi.fn(),
}));

// Mock GCS service
vi.mock('../../src/services/storage/gcs.js', () => ({
  generateUploadUrl: vi.fn(),
  generateDownloadUrl: vi.fn(),
  saveRecordingKey: vi.fn(),
  getRecordingUrl: vi.fn(),
  isGCSConfigured: vi.fn().mockReturnValue(true),
}));

// Mock AI evaluation
vi.mock('../../src/services/ai/evaluation.js', () => ({
  evaluateInterview: vi.fn(),
}));

import { getSession } from '../../src/lib/redis.js';
import { db } from '../../src/lib/db.js';
import { emitTo } from '../../src/lib/socket.js';
import { sendInterviewInvite } from '../../src/services/email/brevo.js';
import { isGCSConfigured, generateUploadUrl } from '../../src/services/storage/gcs.js';

interface InterviewSessionWithInterview extends InterviewSession {
  interview: Partial<Interview>;
}

interface PaginatedResponse<T> {
  data: T[];
  pagination: { total: number; page: number; pageSize: number };
}

interface EmailInviteResponse {
  success: boolean;
  messageId?: string;
  emailMessageId?: string;
}

interface SessionResponse {
  token: string;
  interviewUrl: string;
}

interface MessageResponse {
  userMessage: Partial<InterviewMessage>;
  aiMessage: Partial<InterviewMessage>;
}

interface UploadUrlResponse {
  uploadUrl: string;
  gcsKey: string;
}

describe('Interviews API', () => {
  const mockRecruiterSession = {
    userId: 'recruiter-123',
    email: 'recruiter@test.com',
    role: 'RECRUITER',
    createdAt: Date.now(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Recruiter Routes', () => {
    describe('GET /interviews', () => {
      it('should return interviews for recruiter', async () => {
        vi.mocked(getSession).mockResolvedValueOnce(mockRecruiterSession);
        vi.mocked(db.interview.findMany).mockResolvedValueOnce([
          asMock<Interview>({
            id: 'interview-1',
            recruiterId: mockRecruiterSession.userId,
            candidateEmail: 'candidate@test.com',
            jobRole: 'Engineer',
            status: 'PENDING',
          }),
        ]);
        vi.mocked(db.interview.count).mockResolvedValueOnce(1);

        const res = await app.request('/interviews', {
          headers: { Cookie: 'session=valid-session' },
        });

        expect(res.status).toBe(200);
        const data = await readJson<PaginatedResponse<Interview>>(res);
        expect(data.data).toHaveLength(1);
      });

      it('should filter by status', async () => {
        vi.mocked(getSession).mockResolvedValueOnce(mockRecruiterSession);
        vi.mocked(db.interview.findMany).mockResolvedValueOnce([]);
        vi.mocked(db.interview.count).mockResolvedValueOnce(0);

        const res = await app.request('/interviews?status=IN_PROGRESS', {
          headers: { Cookie: 'session=valid-session' },
        });

        expect(res.status).toBe(200);
        expect(db.interview.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              status: 'IN_PROGRESS',
            }),
          })
        );
      });
    });

    describe('POST /interviews', () => {
      it('should create interview with session', async () => {
        vi.mocked(getSession).mockResolvedValueOnce(mockRecruiterSession);

        const mockTransaction = vi.fn().mockImplementation(async (fn) => {
          const tx = {
            interview: {
              create: vi.fn().mockResolvedValue({
                id: 'new-interview-id',
                recruiterId: mockRecruiterSession.userId,
              }),
              update: vi.fn().mockResolvedValue({
                id: 'new-interview-id',
                interviewUrl: 'https://test.com/interview/new-interview-id?token=abc',
                sessions: [{ id: 'session-1', token: 'abc' }],
              }),
            },
            interviewSession: {
              create: vi.fn().mockResolvedValue({
                id: 'session-1',
                token: 'abc',
              }),
            },
          };
          return fn(tx);
        });
        vi.mocked(db.$transaction).mockImplementation(mockTransaction);

        const res = await app.request('/interviews', {
          method: 'POST',
          headers: {
            Cookie: 'session=valid-session',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            candidateEmail: 'candidate@test.com',
            jobRole: 'Software Engineer',
            timeLimitMinutes: 30,
          }),
        });

        expect(res.status).toBe(201);
      });

      it('should reject invalid email', async () => {
        vi.mocked(getSession).mockResolvedValueOnce(mockRecruiterSession);

        const res = await app.request('/interviews', {
          method: 'POST',
          headers: {
            Cookie: 'session=valid-session',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            candidateEmail: 'not-an-email',
            jobRole: 'Engineer',
          }),
        });

        expect(res.status).toBe(400);
      });

      it('should reject missing jobRole', async () => {
        vi.mocked(getSession).mockResolvedValueOnce(mockRecruiterSession);

        const res = await app.request('/interviews', {
          method: 'POST',
          headers: {
            Cookie: 'session=valid-session',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            candidateEmail: 'candidate@test.com',
          }),
        });

        expect(res.status).toBe(400);
      });
    });

    describe('PATCH /interviews/:id', () => {
      it('should update pending interview', async () => {
        vi.mocked(getSession).mockResolvedValueOnce(mockRecruiterSession);
        vi.mocked(db.interview.findFirst).mockResolvedValueOnce(
          asMock<Interview>({
            id: 'interview-1',
            recruiterId: mockRecruiterSession.userId,
            status: 'PENDING',
          })
        );
        vi.mocked(db.interview.update).mockResolvedValueOnce(
          asMock<Interview>({
            id: 'interview-1',
            candidateName: 'Updated Name',
          })
        );

        const res = await app.request('/interviews/interview-1', {
          method: 'PATCH',
          headers: {
            Cookie: 'session=valid-session',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ candidateName: 'Updated Name' }),
        });

        expect(res.status).toBe(200);
      });

      it('should reject update to started interview', async () => {
        vi.mocked(getSession).mockResolvedValueOnce(mockRecruiterSession);
        vi.mocked(db.interview.findFirst).mockResolvedValueOnce(
          asMock<Interview>({
            id: 'interview-1',
            recruiterId: mockRecruiterSession.userId,
            status: 'IN_PROGRESS',
          })
        );

        const res = await app.request('/interviews/interview-1', {
          method: 'PATCH',
          headers: {
            Cookie: 'session=valid-session',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ candidateName: 'Updated Name' }),
        });

        expect(res.status).toBe(400);
        const data = await readJson<{ error: string }>(res);
        expect(data.error).toContain('Cannot update');
      });
    });

    describe('DELETE /interviews/:id', () => {
      it('should delete interview', async () => {
        vi.mocked(getSession).mockResolvedValueOnce(mockRecruiterSession);
        vi.mocked(db.interview.findFirst).mockResolvedValueOnce(
          asMock<Interview>({
            id: 'interview-1',
            recruiterId: mockRecruiterSession.userId,
          })
        );
        vi.mocked(db.interview.delete).mockResolvedValueOnce(
          asMock<Interview>({ id: 'interview-1' })
        );

        const res = await app.request('/interviews/interview-1', {
          method: 'DELETE',
          headers: { Cookie: 'session=valid-session' },
        });

        expect(res.status).toBe(200);
      });
    });

    describe('POST /interviews/:id/sessions', () => {
      it('should create new session token', async () => {
        vi.mocked(getSession).mockResolvedValueOnce(mockRecruiterSession);
        vi.mocked(db.interview.findFirst).mockResolvedValueOnce(
          asMock<Interview>({
            id: 'interview-1',
            recruiterId: mockRecruiterSession.userId,
          })
        );
        vi.mocked(db.interviewSession.create).mockResolvedValueOnce(
          asMock<InterviewSession>({
            id: 'session-1',
            token: 'new-token-abc',
            expiresAt: new Date(),
          })
        );
        vi.mocked(db.interview.update).mockResolvedValueOnce(
          asMock<Interview>({
            id: 'interview-1',
            interviewUrl: 'https://test.com/interview/interview-1?token=new-token-abc',
          })
        );

        const res = await app.request('/interviews/interview-1/sessions', {
          method: 'POST',
          headers: { Cookie: 'session=valid-session' },
        });

        expect(res.status).toBe(201);
        const data = await readJson<SessionResponse>(res);
        expect(data.token).toBeDefined();
        expect(data.interviewUrl).toContain('token=');
      });
    });

    describe('POST /interviews/:id/invite/email', () => {
      it('should send email invite', async () => {
        vi.mocked(getSession).mockResolvedValueOnce(mockRecruiterSession);
        vi.mocked(db.interview.findFirst).mockResolvedValueOnce(
          asMock<Interview>({
            id: 'interview-1',
            interviewUrl: 'https://test.com/interview/interview-1?token=abc',
          })
        );
        vi.mocked(sendInterviewInvite).mockResolvedValueOnce(
          asMock<EmailInviteResponse>({
            success: true,
            messageId: 'msg-123',
            emailMessageId: 'email-123',
          })
        );

        const res = await app.request('/interviews/interview-1/invite/email', {
          method: 'POST',
          headers: { Cookie: 'session=valid-session' },
        });

        expect(res.status).toBe(200);
        const data = await readJson<EmailInviteResponse>(res);
        expect(data.success).toBe(true);
      });

      it('should reject if no interview URL', async () => {
        vi.mocked(getSession).mockResolvedValueOnce(mockRecruiterSession);
        vi.mocked(db.interview.findFirst).mockResolvedValueOnce(
          asMock<Interview>({
            id: 'interview-1',
            interviewUrl: null,
          })
        );

        const res = await app.request('/interviews/interview-1/invite/email', {
          method: 'POST',
          headers: { Cookie: 'session=valid-session' },
        });

        expect(res.status).toBe(400);
      });
    });
  });

  describe('Candidate Routes (Token Auth)', () => {
    const mockInterviewSession = asMock<InterviewSessionWithInterview>({
      id: 'session-1',
      interviewId: 'interview-1',
      token: 'valid-token',
      expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
      revokedAt: null,
      interview: {
        id: 'interview-1',
        jobRole: 'Engineer',
        type: 'TEXT',
        timeLimitMinutes: 30,
        status: 'PENDING',
        recruiterId: 'recruiter-123',
      },
    });

    describe('GET /interviews/candidate/current', () => {
      it('should return interview info for valid token', async () => {
        vi.mocked(db.interviewSession.findUnique).mockResolvedValueOnce(mockInterviewSession);
        vi.mocked(db.interviewSession.update).mockResolvedValueOnce(mockInterviewSession);

        const res = await app.request('/interviews/candidate/current', {
          headers: { 'X-Interview-Token': 'valid-token' },
        });

        expect(res.status).toBe(200);
        const data = await readJson<Partial<Interview>>(res);
        expect(data.jobRole).toBe('Engineer');
      });

      it('should reject expired token', async () => {
        vi.mocked(db.interviewSession.findUnique).mockResolvedValueOnce(
          asMock<InterviewSessionWithInterview>({
            ...mockInterviewSession,
            expiresAt: new Date(Date.now() - 1000), // Expired
          })
        );

        const res = await app.request('/interviews/candidate/current', {
          headers: { 'X-Interview-Token': 'expired-token' },
        });

        expect(res.status).toBe(401);
      });

      it('should reject revoked token', async () => {
        vi.mocked(db.interviewSession.findUnique).mockResolvedValueOnce(
          asMock<InterviewSessionWithInterview>({
            ...mockInterviewSession,
            revokedAt: new Date(),
          })
        );

        const res = await app.request('/interviews/candidate/current', {
          headers: { 'X-Interview-Token': 'revoked-token' },
        });

        expect(res.status).toBe(401);
      });

      it('should accept token from query param', async () => {
        vi.mocked(db.interviewSession.findUnique).mockResolvedValueOnce(mockInterviewSession);
        vi.mocked(db.interviewSession.update).mockResolvedValueOnce(mockInterviewSession);

        const res = await app.request('/interviews/candidate/current?token=valid-token');

        expect(res.status).toBe(200);
      });
    });

    describe('POST /interviews/candidate/start', () => {
      it('should start pending interview', async () => {
        vi.mocked(db.interviewSession.findUnique).mockResolvedValueOnce(mockInterviewSession);
        vi.mocked(db.interviewSession.update).mockResolvedValueOnce(mockInterviewSession);
        vi.mocked(db.interview.update).mockResolvedValueOnce(
          asMock<Interview>({
            ...mockInterviewSession.interview,
            status: 'IN_PROGRESS',
            startedAt: new Date(),
          })
        );

        const res = await app.request('/interviews/candidate/start', {
          method: 'POST',
          headers: { 'X-Interview-Token': 'valid-token' },
        });

        expect(res.status).toBe(200);
        const data = await readJson<Partial<Interview>>(res);
        expect(data.status).toBe('IN_PROGRESS');
        expect(emitTo.user).toHaveBeenCalledWith(
          'recruiter-123',
          'interview:status',
          expect.objectContaining({ status: 'IN_PROGRESS' })
        );
      });

      it('should reject if already started', async () => {
        vi.mocked(db.interviewSession.findUnique).mockResolvedValueOnce(
          asMock<InterviewSessionWithInterview>({
            ...mockInterviewSession,
            interview: { ...mockInterviewSession.interview, status: 'IN_PROGRESS' },
          })
        );
        vi.mocked(db.interviewSession.update).mockResolvedValueOnce(mockInterviewSession);

        const res = await app.request('/interviews/candidate/start', {
          method: 'POST',
          headers: { 'X-Interview-Token': 'valid-token' },
        });

        expect(res.status).toBe(400);
      });
    });

    describe('POST /interviews/candidate/message', () => {
      it('should send message for text interview', async () => {
        vi.mocked(db.interviewSession.findUnique).mockResolvedValueOnce(
          asMock<InterviewSessionWithInterview>({
            ...mockInterviewSession,
            interview: { ...mockInterviewSession.interview, status: 'IN_PROGRESS' },
          })
        );
        vi.mocked(db.interviewSession.update).mockResolvedValueOnce(mockInterviewSession);
        vi.mocked(db.interviewMessage.create)
          .mockResolvedValueOnce(asMock<InterviewMessage>({ id: 'msg-1', role: 'user', content: 'Hello' }))
          .mockResolvedValueOnce(asMock<InterviewMessage>({ id: 'msg-2', role: 'assistant', content: 'Response' }));

        const res = await app.request('/interviews/candidate/message', {
          method: 'POST',
          headers: {
            'X-Interview-Token': 'valid-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ content: 'Hello' }),
        });

        expect(res.status).toBe(200);
        const data = await readJson<MessageResponse>(res);
        expect(data.userMessage).toBeDefined();
        expect(data.aiMessage).toBeDefined();
      });

      it('should reject for voice interview', async () => {
        vi.mocked(db.interviewSession.findUnique).mockResolvedValueOnce(
          asMock<InterviewSessionWithInterview>({
            ...mockInterviewSession,
            interview: {
              ...mockInterviewSession.interview,
              status: 'IN_PROGRESS',
              type: 'VOICE',
            },
          })
        );
        vi.mocked(db.interviewSession.update).mockResolvedValueOnce(mockInterviewSession);

        const res = await app.request('/interviews/candidate/message', {
          method: 'POST',
          headers: {
            'X-Interview-Token': 'valid-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ content: 'Hello' }),
        });

        expect(res.status).toBe(400);
        const data = await readJson<{ error: string }>(res);
        expect(data.error).toContain('text interviews');
      });
    });

    describe('POST /interviews/candidate/complete', () => {
      it('should complete interview', async () => {
        vi.mocked(db.interviewSession.findUnique).mockResolvedValueOnce(
          asMock<InterviewSessionWithInterview>({
            ...mockInterviewSession,
            interview: { ...mockInterviewSession.interview, status: 'IN_PROGRESS' },
          })
        );
        vi.mocked(db.interviewSession.update).mockResolvedValueOnce(mockInterviewSession);
        vi.mocked(db.interview.update).mockResolvedValueOnce(
          asMock<Interview>({
            status: 'COMPLETED',
            completedAt: new Date(),
          })
        );
        vi.mocked(db.interviewMessage.findMany).mockResolvedValueOnce([]);

        const res = await app.request('/interviews/candidate/complete', {
          method: 'POST',
          headers: { 'X-Interview-Token': 'valid-token' },
        });

        expect(res.status).toBe(200);
        const data = await readJson<Partial<Interview>>(res);
        expect(data.status).toBe('COMPLETED');
      });
    });

    describe('Recording Routes', () => {
      describe('POST /interviews/:id/recording/upload-url', () => {
        it('should generate upload URL for voice interview', async () => {
          vi.mocked(db.interviewSession.findUnique).mockResolvedValueOnce(
            asMock<InterviewSessionWithInterview>({
              ...mockInterviewSession,
              interview: { ...mockInterviewSession.interview, type: 'VOICE' },
            })
          );
          vi.mocked(db.interviewSession.update).mockResolvedValueOnce(mockInterviewSession);
          vi.mocked(isGCSConfigured).mockReturnValue(true);
          vi.mocked(generateUploadUrl).mockResolvedValueOnce(
            asMock<UploadUrlResponse>({
              uploadUrl: 'https://storage.googleapis.com/upload',
              gcsKey: 'recordings/interview-1/123.webm',
            })
          );

          const res = await app.request('/interviews/interview-1/recording/upload-url', {
            method: 'POST',
            headers: {
              'X-Interview-Token': 'valid-token',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ contentType: 'video/webm' }),
          });

          expect(res.status).toBe(200);
          const data = await readJson<UploadUrlResponse>(res);
          expect(data.uploadUrl).toBeDefined();
          expect(data.gcsKey).toBeDefined();
        });

        it('should reject for text interview', async () => {
          vi.mocked(db.interviewSession.findUnique).mockResolvedValueOnce(mockInterviewSession);
          vi.mocked(db.interviewSession.update).mockResolvedValueOnce(mockInterviewSession);

          const res = await app.request('/interviews/interview-1/recording/upload-url', {
            method: 'POST',
            headers: {
              'X-Interview-Token': 'valid-token',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({}),
          });

          expect(res.status).toBe(400);
        });
      });
    });
  });
});
