import { describe, expect, it, vi, beforeEach } from 'vitest';
import { app } from '../../src/app.js';
import type { File, Interview, InterviewSession } from '@prisma/client';
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
      file: { create: vi.fn() },
      recruiterProfile: { upsert: vi.fn() },
      candidateProfile: { upsert: vi.fn() },
      interview: { update: vi.fn() },
      jobApplication: { update: vi.fn() },
    })),
    file: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    interview: {
      findFirst: vi.fn(),
    },
    jobApplication: {
      findFirst: vi.fn(),
    },
    interviewSession: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { getSession } from '../../src/lib/redis.js';
import { db } from '../../src/lib/db.js';

interface FileWithRelations extends File {
  interview?: { recruiterId: string };
}

interface InterviewSessionWithInterview extends InterviewSession {
  interview: Partial<Interview>;
}

describe('Files API', () => {
  const mockRecruiterSession = {
    userId: 'recruiter-123',
    email: 'recruiter@test.com',
    role: 'RECRUITER',
    createdAt: Date.now(),
  };

  const mockCandidateSession = {
    userId: 'candidate-123',
    email: 'candidate@test.com',
    role: 'CANDIDATE',
    createdAt: Date.now(),
  };

  const mockInterviewSession = asMock<InterviewSessionWithInterview>({
    id: 'session-1',
    interviewId: 'interview-1',
    token: 'valid-token',
    expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
    revokedAt: null,
    interview: {
      id: 'interview-1',
      recruiterId: 'recruiter-123',
      status: 'PENDING',
    },
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /files/:id', () => {
    describe('Authorization Rules', () => {
      it('should allow access to LOGO files without auth (public)', async () => {
        vi.mocked(db.file.findUnique).mockResolvedValueOnce(
          asMock<File>({
            id: 'file-1',
            name: 'logo.png',
            mimeType: 'image/png',
            size: 1024,
            category: 'LOGO',
            uploadedBy: 'some-user',
          })
        );
        vi.mocked(db.$queryRaw).mockResolvedValueOnce([
          { chunk: Buffer.from('fake-image-data') },
        ]);

        const res = await app.request('/files/file-1');
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('image/png');
      });

      it('should allow owner to access their RESUME', async () => {
        vi.mocked(getSession).mockResolvedValueOnce(mockCandidateSession);
        vi.mocked(db.file.findUnique).mockResolvedValueOnce(
          asMock<File>({
            id: 'file-1',
            name: 'resume.pdf',
            mimeType: 'application/pdf',
            size: 2048,
            category: 'RESUME',
            uploadedBy: mockCandidateSession.userId,
          })
        );
        vi.mocked(db.$queryRaw).mockResolvedValueOnce([
          { chunk: Buffer.from('fake-pdf-data') },
        ]);

        const res = await app.request('/files/file-1', {
          headers: { Cookie: 'session=valid-session' },
        });

        expect(res.status).toBe(200);
      });

      it('should allow recruiter to access resume attached to their interview', async () => {
        vi.mocked(getSession).mockResolvedValueOnce(mockRecruiterSession);
        vi.mocked(db.file.findUnique).mockResolvedValueOnce(
          asMock<FileWithRelations>({
            id: 'file-1',
            name: 'resume.pdf',
            mimeType: 'application/pdf',
            size: 2048,
            category: 'RESUME',
            uploadedBy: 'candidate-456',
            interview: { recruiterId: mockRecruiterSession.userId },
          })
        );
        vi.mocked(db.$queryRaw).mockResolvedValueOnce([
          { chunk: Buffer.from('fake-pdf-data') },
        ]);

        const res = await app.request('/files/file-1', {
          headers: { Cookie: 'session=valid-session' },
        });

        expect(res.status).toBe(200);
      });

      it('should allow candidate with interview token to access interview files', async () => {
        vi.mocked(db.interviewSession.findUnique).mockResolvedValueOnce(mockInterviewSession);
        vi.mocked(db.interviewSession.update).mockResolvedValueOnce(mockInterviewSession);
        vi.mocked(db.file.findUnique).mockResolvedValueOnce(
          asMock<File>({
            id: 'file-1',
            name: 'document.pdf',
            mimeType: 'application/pdf',
            size: 1024,
            category: 'DOCUMENT',
            interviewId: mockInterviewSession.interviewId,
          })
        );
        vi.mocked(db.$queryRaw).mockResolvedValueOnce([
          { chunk: Buffer.from('fake-pdf-data') },
        ]);

        const res = await app.request('/files/file-1', {
          headers: { 'X-Interview-Token': 'valid-token' },
        });

        expect(res.status).toBe(200);
      });

      it('should deny access to files not belonging to user', async () => {
        vi.mocked(getSession).mockResolvedValueOnce(mockCandidateSession);
        vi.mocked(db.file.findUnique).mockResolvedValueOnce(
          asMock<File>({
            id: 'file-1',
            name: 'other-resume.pdf',
            mimeType: 'application/pdf',
            size: 2048,
            category: 'RESUME',
            uploadedBy: 'other-user',
          })
        );

        const res = await app.request('/files/file-1', {
          headers: { Cookie: 'session=valid-session' },
        });

        expect(res.status).toBe(403);
      });

      it('should return 404 for non-existent file', async () => {
        vi.mocked(getSession).mockResolvedValueOnce(mockRecruiterSession);
        vi.mocked(db.file.findUnique).mockResolvedValueOnce(null);

        const res = await app.request('/files/non-existent', {
          headers: { Cookie: 'session=valid-session' },
        });

        expect(res.status).toBe(404);
      });

      it('should allow ADMIN to access any file', async () => {
        const adminSession = {
          userId: 'admin-123',
          email: 'admin@test.com',
          role: 'ADMIN',
          createdAt: Date.now(),
        };
        vi.mocked(getSession).mockResolvedValueOnce(adminSession);
        vi.mocked(db.file.findUnique).mockResolvedValueOnce(
          asMock<File>({
            id: 'file-1',
            name: 'any-file.pdf',
            mimeType: 'application/pdf',
            size: 1024,
            category: 'DOCUMENT',
            uploadedBy: 'some-user',
          })
        );
        vi.mocked(db.$queryRaw).mockResolvedValueOnce([
          { chunk: Buffer.from('fake-data') },
        ]);

        const res = await app.request('/files/file-1', {
          headers: { Cookie: 'session=admin-session' },
        });

        expect(res.status).toBe(200);
      });
    });

    describe('Caching Headers', () => {
      it('should set public cache for LOGO files', async () => {
        vi.mocked(db.file.findUnique).mockResolvedValueOnce(
          asMock<File>({
            id: 'file-1',
            name: 'logo.png',
            mimeType: 'image/png',
            size: 1024,
            category: 'LOGO',
          })
        );
        vi.mocked(db.$queryRaw).mockResolvedValueOnce([
          { chunk: Buffer.from('fake-data') },
        ]);

        const res = await app.request('/files/file-1');

        expect(res.headers.get('Cache-Control')).toContain('public');
      });

      it('should set private cache for non-LOGO files', async () => {
        vi.mocked(getSession).mockResolvedValueOnce(mockRecruiterSession);
        vi.mocked(db.file.findUnique).mockResolvedValueOnce(
          asMock<File>({
            id: 'file-1',
            name: 'resume.pdf',
            mimeType: 'application/pdf',
            size: 1024,
            category: 'RESUME',
            uploadedBy: mockRecruiterSession.userId,
          })
        );
        vi.mocked(db.$queryRaw).mockResolvedValueOnce([
          { chunk: Buffer.from('fake-data') },
        ]);

        const res = await app.request('/files/file-1', {
          headers: { Cookie: 'session=valid-session' },
        });

        expect(res.headers.get('Cache-Control')).toContain('private');
      });
    });
  });

  describe('POST /files', () => {
    it('should require authentication', async () => {
      const formData = new FormData();
      formData.append('file', new Blob(['test'], { type: 'image/png' }), 'test.png');
      formData.append('category', 'LOGO');
      formData.append('purpose', 'recruiter_logo');

      const res = await app.request('/files', {
        method: 'POST',
        body: formData,
      });

      expect(res.status).toBe(401);
    });

    it('should validate file category', async () => {
      vi.mocked(getSession).mockResolvedValueOnce(mockRecruiterSession);

      const formData = new FormData();
      formData.append('file', new Blob(['test'], { type: 'image/png' }), 'test.png');
      formData.append('category', 'INVALID');
      formData.append('purpose', 'recruiter_logo');

      const res = await app.request('/files', {
        method: 'POST',
        headers: { Cookie: 'session=valid-session' },
        body: formData,
      });

      expect(res.status).toBe(400);
    });

    it('should validate purpose matches category', async () => {
      vi.mocked(getSession).mockResolvedValueOnce(mockRecruiterSession);

      const formData = new FormData();
      formData.append('file', new Blob(['test'], { type: 'image/png' }), 'test.png');
      formData.append('category', 'LOGO');
      formData.append('purpose', 'profile_resume'); // Wrong purpose for LOGO

      const res = await app.request('/files', {
        method: 'POST',
        headers: { Cookie: 'session=valid-session' },
        body: formData,
      });

      expect(res.status).toBe(400);
    });

    it('should validate MIME type', async () => {
      vi.mocked(getSession).mockResolvedValueOnce(mockRecruiterSession);

      const formData = new FormData();
      formData.append('file', new Blob(['test'], { type: 'application/pdf' }), 'test.pdf');
      formData.append('category', 'LOGO'); // PDF not allowed for LOGO
      formData.append('purpose', 'recruiter_logo');

      const res = await app.request('/files', {
        method: 'POST',
        headers: { Cookie: 'session=valid-session' },
        body: formData,
      });

      expect(res.status).toBe(400);
      const data = await readJson<{ error: string }>(res);
      expect(data.error).toContain('Invalid file type');
    });

    it('should allow candidate upload with interview token', async () => {
      vi.mocked(db.interviewSession.findUnique).mockResolvedValueOnce(mockInterviewSession);
      vi.mocked(db.interviewSession.update).mockResolvedValueOnce(mockInterviewSession);

      const mockTransaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          file: {
            create: vi.fn().mockResolvedValue({
              id: 'new-file-id',
              name: 'resume.pdf',
              mimeType: 'application/pdf',
              size: 1024,
              category: 'RESUME',
            }),
          },
          interview: { update: vi.fn() },
        };
        return fn(tx);
      });
      vi.mocked(db.$transaction).mockImplementation(mockTransaction);

      const formData = new FormData();
      formData.append('file', new Blob(['test'], { type: 'application/pdf' }), 'resume.pdf');
      formData.append('category', 'RESUME');
      formData.append('purpose', 'interview_resume');

      const res = await app.request('/files', {
        method: 'POST',
        headers: { 'X-Interview-Token': 'valid-token' },
        body: formData,
      });

      expect(res.status).toBe(201);
    });

    it('should reject candidate upload with wrong purpose', async () => {
      vi.mocked(db.interviewSession.findUnique).mockResolvedValueOnce(mockInterviewSession);
      vi.mocked(db.interviewSession.update).mockResolvedValueOnce(mockInterviewSession);

      const formData = new FormData();
      formData.append('file', new Blob(['test'], { type: 'image/png' }), 'logo.png');
      formData.append('category', 'LOGO');
      formData.append('purpose', 'recruiter_logo'); // Candidates can't upload recruiter logos

      const res = await app.request('/files', {
        method: 'POST',
        headers: { 'X-Interview-Token': 'valid-token' },
        body: formData,
      });

      expect(res.status).toBe(403);
    });

    it('should require interviewId for interview_attachment purpose', async () => {
      vi.mocked(getSession).mockResolvedValueOnce(mockRecruiterSession);

      const formData = new FormData();
      formData.append('file', new Blob(['test'], { type: 'application/pdf' }), 'doc.pdf');
      formData.append('category', 'DOCUMENT');
      formData.append('purpose', 'interview_attachment');
      // Missing interviewId

      const res = await app.request('/files', {
        method: 'POST',
        headers: { Cookie: 'session=valid-session' },
        body: formData,
      });

      expect(res.status).toBe(400);
      const data = await readJson<{ error: string }>(res);
      expect(data.error).toContain('interviewId');
    });
  });

  describe('DELETE /files/:id', () => {
    it('should allow owner to delete file', async () => {
      vi.mocked(getSession).mockResolvedValueOnce(mockRecruiterSession);
      vi.mocked(db.file.findUnique).mockResolvedValueOnce(
        asMock<File>({
          id: 'file-1',
          uploadedBy: mockRecruiterSession.userId,
        })
      );
      vi.mocked(db.file.delete).mockResolvedValueOnce(asMock<File>({ id: 'file-1' }));

      const res = await app.request('/files/file-1', {
        method: 'DELETE',
        headers: { Cookie: 'session=valid-session' },
      });

      expect(res.status).toBe(200);
    });

    it('should allow admin to delete any file', async () => {
      const adminSession = {
        userId: 'admin-123',
        email: 'admin@test.com',
        role: 'ADMIN',
        createdAt: Date.now(),
      };
      vi.mocked(getSession).mockResolvedValueOnce(adminSession);
      vi.mocked(db.file.findUnique).mockResolvedValueOnce(
        asMock<File>({
          id: 'file-1',
          uploadedBy: 'other-user',
        })
      );
      vi.mocked(db.file.delete).mockResolvedValueOnce(asMock<File>({ id: 'file-1' }));

      const res = await app.request('/files/file-1', {
        method: 'DELETE',
        headers: { Cookie: 'session=admin-session' },
      });

      expect(res.status).toBe(200);
    });

    it('should reject non-owner delete', async () => {
      vi.mocked(getSession).mockResolvedValueOnce(mockRecruiterSession);
      vi.mocked(db.file.findUnique).mockResolvedValueOnce(
        asMock<File>({
          id: 'file-1',
          uploadedBy: 'other-user',
        })
      );

      const res = await app.request('/files/file-1', {
        method: 'DELETE',
        headers: { Cookie: 'session=valid-session' },
      });

      expect(res.status).toBe(403);
    });

    it('should return 404 for non-existent file', async () => {
      vi.mocked(getSession).mockResolvedValueOnce(mockRecruiterSession);
      vi.mocked(db.file.findUnique).mockResolvedValueOnce(null);

      const res = await app.request('/files/non-existent', {
        method: 'DELETE',
        headers: { Cookie: 'session=valid-session' },
      });

      expect(res.status).toBe(404);
    });
  });
});
