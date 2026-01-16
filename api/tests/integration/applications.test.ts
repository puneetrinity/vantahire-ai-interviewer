import { describe, expect, it, vi, beforeEach } from 'vitest';
import { app } from '../../src/app.js';
import type { CandidateProfile, Job, JobApplication, User } from '@prisma/client';
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
    jobApplication: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    job: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    candidateProfile: {
      findUnique: vi.fn(),
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

import { getSession } from '../../src/lib/redis.js';
import { db } from '../../src/lib/db.js';
import { emitTo } from '../../src/lib/socket.js';

describe('Applications API', () => {
  // Use valid UUIDs for tests since the API validates them
  const mockJobId = '123e4567-e89b-12d3-a456-426614174001';
  const mockAppId = '123e4567-e89b-12d3-a456-426614174002';

  const mockCandidateSession = {
    userId: '123e4567-e89b-12d3-a456-426614174003',
    email: 'candidate@test.com',
    role: 'CANDIDATE',
    createdAt: Date.now(),
  };

  const mockRecruiterSession = {
    userId: '123e4567-e89b-12d3-a456-426614174004',
    email: 'recruiter@test.com',
    role: 'RECRUITER',
    createdAt: Date.now(),
  };

  const mockAdminSession = {
    userId: '123e4567-e89b-12d3-a456-426614174005',
    email: 'admin@test.com',
    role: 'ADMIN',
    createdAt: Date.now(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Candidate Routes', () => {
    describe('GET /applications/mine', () => {
      it('should return candidate\'s applications', async () => {
        vi.mocked(getSession).mockResolvedValueOnce(mockCandidateSession);
        vi.mocked(db.jobApplication.findMany).mockResolvedValueOnce([
          asMock<JobApplication & { job: { id: string; title: string } }>({
            id: mockAppId,
            candidateId: mockCandidateSession.userId,
            jobId: mockJobId,
            status: 'PENDING',
            job: { id: mockJobId, title: 'Engineer' },
          }),
        ]);
        vi.mocked(db.jobApplication.count).mockResolvedValueOnce(1);

        const res = await app.request('/applications/mine', {
          headers: { Cookie: 'session=valid-session' },
        });

        expect(res.status).toBe(200);
        const data = await readJson<{ data: unknown[] }>(res);
        expect(data.data).toHaveLength(1);
      });

      it('should reject non-candidate users', async () => {
        vi.mocked(getSession).mockResolvedValueOnce(mockRecruiterSession);

        const res = await app.request('/applications/mine', {
          headers: { Cookie: 'session=valid-session' },
        });

        expect(res.status).toBe(403);
      });
    });

    describe('POST /applications', () => {
      it('should create application for active job', async () => {
        vi.mocked(getSession).mockResolvedValueOnce(mockCandidateSession);
        vi.mocked(db.job.findUnique).mockResolvedValueOnce(
          asMock<Job>({
            id: mockJobId,
            status: 'ACTIVE',
            recruiterId: mockRecruiterSession.userId,
          })
        );
        vi.mocked(db.jobApplication.findFirst).mockResolvedValueOnce(null);
        vi.mocked(db.candidateProfile.findUnique).mockResolvedValueOnce(
          asMock<CandidateProfile>({
            userId: mockCandidateSession.userId,
            resumeFileId: '123e4567-e89b-12d3-a456-426614174010',
          })
        );
        vi.mocked(db.jobApplication.create).mockResolvedValueOnce(
          asMock<JobApplication & { job: { id: string; title: string } }>({
            id: mockAppId,
            jobId: mockJobId,
            candidateId: mockCandidateSession.userId,
            status: 'PENDING',
            job: { id: mockJobId, title: 'Engineer' },
          })
        );

        const res = await app.request('/applications', {
          method: 'POST',
          headers: {
            Cookie: 'session=valid-session',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            jobId: mockJobId,
            coverLetter: 'I am interested in this position.',
          }),
        });

        expect(res.status).toBe(201);
        expect(emitTo.user).toHaveBeenCalledWith(
          mockRecruiterSession.userId,
          'application:new',
          expect.any(Object)
        );
      });

      it('should reject application to inactive job', async () => {
        vi.mocked(getSession).mockResolvedValueOnce(mockCandidateSession);
        vi.mocked(db.job.findUnique).mockResolvedValueOnce(
          asMock<Job>({
            id: mockJobId,
            status: 'CLOSED',
            recruiterId: mockRecruiterSession.userId,
          })
        );

        const res = await app.request('/applications', {
          method: 'POST',
          headers: {
            Cookie: 'session=valid-session',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ jobId: mockJobId }),
        });

        expect(res.status).toBe(400);
        const data = await readJson<{ error: string }>(res);
        expect(data.error).toContain('not accepting');
      });

      it('should reject duplicate application', async () => {
        vi.mocked(getSession).mockResolvedValueOnce(mockCandidateSession);
        vi.mocked(db.job.findUnique).mockResolvedValueOnce(
          asMock<Job>({
            id: mockJobId,
            status: 'ACTIVE',
          })
        );
        vi.mocked(db.jobApplication.findFirst).mockResolvedValueOnce(
          asMock<JobApplication>({
            id: mockAppId,
            jobId: mockJobId,
            candidateId: mockCandidateSession.userId,
          })
        );

        const res = await app.request('/applications', {
          method: 'POST',
          headers: {
            Cookie: 'session=valid-session',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ jobId: mockJobId }),
        });

        expect(res.status).toBe(400);
        const data = await readJson<{ error: string }>(res);
        // API returns "You have already applied for this job"
        expect(data.error).toContain('already applied');
      });
    });

    describe('PATCH /applications/mine/:id', () => {
      it('should update pending application', async () => {
        vi.mocked(getSession).mockResolvedValueOnce(mockCandidateSession);
        vi.mocked(db.jobApplication.findFirst).mockResolvedValueOnce(
          asMock<JobApplication>({
            id: mockAppId,
            candidateId: mockCandidateSession.userId,
            status: 'PENDING',
          })
        );
        vi.mocked(db.jobApplication.update).mockResolvedValueOnce(
          asMock<JobApplication>({
            id: mockAppId,
            coverLetter: 'Updated cover letter',
          })
        );

        const res = await app.request(`/applications/mine/${mockAppId}`, {
          method: 'PATCH',
          headers: {
            Cookie: 'session=valid-session',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ coverLetter: 'Updated cover letter' }),
        });

        expect(res.status).toBe(200);
      });

      it('should reject update to reviewed application', async () => {
        vi.mocked(getSession).mockResolvedValueOnce(mockCandidateSession);
        vi.mocked(db.jobApplication.findFirst).mockResolvedValueOnce(
          asMock<JobApplication>({
            id: mockAppId,
            candidateId: mockCandidateSession.userId,
            status: 'REVIEWED',
          })
        );

        const res = await app.request(`/applications/mine/${mockAppId}`, {
          method: 'PATCH',
          headers: {
            Cookie: 'session=valid-session',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ coverLetter: 'Updated' }),
        });

        expect(res.status).toBe(400);
        const data = await readJson<{ error: string }>(res);
        // API returns "Cannot update application after it has been reviewed"
        expect(data.error).toContain('Cannot update');
      });
    });

    describe('DELETE /applications/mine/:id', () => {
      it('should withdraw pending application', async () => {
        vi.mocked(getSession).mockResolvedValueOnce(mockCandidateSession);
        vi.mocked(db.jobApplication.findFirst).mockResolvedValueOnce(
          asMock<JobApplication>({
            id: mockAppId,
            candidateId: mockCandidateSession.userId,
            status: 'PENDING',
          })
        );
        vi.mocked(db.jobApplication.delete).mockResolvedValueOnce(
          asMock<JobApplication>({ id: mockAppId })
        );

        const res = await app.request(`/applications/mine/${mockAppId}`, {
          method: 'DELETE',
          headers: { Cookie: 'session=valid-session' },
        });

        expect(res.status).toBe(200);
      });

      it('should allow withdrawal of reviewed application', async () => {
        vi.mocked(getSession).mockResolvedValueOnce(mockCandidateSession);
        vi.mocked(db.jobApplication.findFirst).mockResolvedValueOnce(
          asMock<JobApplication>({
            id: mockAppId,
            candidateId: mockCandidateSession.userId,
            status: 'REVIEWED',
          })
        );
        vi.mocked(db.jobApplication.delete).mockResolvedValueOnce(
          asMock<JobApplication>({ id: mockAppId })
        );

        const res = await app.request(`/applications/mine/${mockAppId}`, {
          method: 'DELETE',
          headers: { Cookie: 'session=valid-session' },
        });

        expect(res.status).toBe(200);
      });

      it('should reject withdrawal of shortlisted application', async () => {
        vi.mocked(getSession).mockResolvedValueOnce(mockCandidateSession);
        vi.mocked(db.jobApplication.findFirst).mockResolvedValueOnce(
          asMock<JobApplication>({
            id: mockAppId,
            candidateId: mockCandidateSession.userId,
            status: 'SHORTLISTED',
          })
        );

        const res = await app.request(`/applications/mine/${mockAppId}`, {
          method: 'DELETE',
          headers: { Cookie: 'session=valid-session' },
        });

        expect(res.status).toBe(400);
        const data = await readJson<{ error: string }>(res);
        // API returns "Cannot withdraw application at this stage"
        expect(data.error).toContain('Cannot withdraw');
      });
    });
  });

  describe('Recruiter Routes', () => {
    describe('GET /applications/job/:jobId', () => {
      it('should return applications for owned job', async () => {
        vi.mocked(getSession).mockResolvedValueOnce(mockRecruiterSession);
        vi.mocked(db.job.findFirst).mockResolvedValueOnce(
          asMock<Job>({
            id: mockJobId,
            recruiterId: mockRecruiterSession.userId,
          })
        );
        vi.mocked(db.jobApplication.findMany).mockResolvedValueOnce([
          asMock<JobApplication>({
            id: mockAppId,
            candidateId: mockCandidateSession.userId,
          }),
        ]);
        vi.mocked(db.jobApplication.count).mockResolvedValueOnce(1);
        vi.mocked(db.user.findMany).mockResolvedValueOnce([
          asMock<User>({
            id: mockCandidateSession.userId,
            email: 'candidate@test.com',
            fullName: 'Test Candidate',
          }),
        ]);

        const res = await app.request(`/applications/job/${mockJobId}`, {
          headers: { Cookie: 'session=valid-session' },
        });

        expect(res.status).toBe(200);
        const data = await readJson<{ data: Array<{ candidate?: unknown }> }>(res);
        expect(data.data).toHaveLength(1);
        expect(data.data[0].candidate).toBeDefined();
      });

      it('should return 404 for unauthorized job', async () => {
        vi.mocked(getSession).mockResolvedValueOnce(mockRecruiterSession);
        vi.mocked(db.job.findFirst).mockResolvedValueOnce(null);

        const res = await app.request(`/applications/job/${mockJobId}`, {
          headers: { Cookie: 'session=valid-session' },
        });

        expect(res.status).toBe(404);
      });
    });

    describe('PATCH /applications/:id/status', () => {
      it('should allow valid status transition', async () => {
        vi.mocked(getSession).mockResolvedValueOnce(mockRecruiterSession);
        vi.mocked(db.jobApplication.findFirst).mockResolvedValueOnce(
          asMock<JobApplication & { job: { title: string; recruiterId: string } }>({
            id: mockAppId,
            status: 'PENDING',
            candidateId: mockCandidateSession.userId,
            job: { title: 'Engineer', recruiterId: mockRecruiterSession.userId },
          })
        );
        vi.mocked(db.jobApplication.update).mockResolvedValueOnce(
          asMock<JobApplication>({
            id: mockAppId,
            status: 'REVIEWED',
          })
        );

        const res = await app.request(`/applications/${mockAppId}/status`, {
          method: 'PATCH',
          headers: {
            Cookie: 'session=valid-session',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: 'REVIEWED' }),
        });

        expect(res.status).toBe(200);
        expect(emitTo.user).toHaveBeenCalledWith(
          mockCandidateSession.userId,
          'application:status',
          expect.objectContaining({ status: 'REVIEWED' })
        );
      });

      it('should reject invalid status transition', async () => {
        vi.mocked(getSession).mockResolvedValueOnce(mockRecruiterSession);
        vi.mocked(db.jobApplication.findFirst).mockResolvedValueOnce(
          asMock<JobApplication & { job: { title: string; recruiterId: string } }>({
            id: mockAppId,
            status: 'PENDING',
            candidateId: mockCandidateSession.userId,
            job: { title: 'Engineer', recruiterId: mockRecruiterSession.userId },
          })
        );

        const res = await app.request(`/applications/${mockAppId}/status`, {
          method: 'PATCH',
          headers: {
            Cookie: 'session=valid-session',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: 'HIRED' }), // Invalid: PENDING -> HIRED
        });

        expect(res.status).toBe(400);
        const data = await readJson<{ error: string }>(res);
        expect(data.error).toContain('Invalid status transition');
      });

      it('should allow full hiring path', async () => {
        // PENDING -> REVIEWED
        vi.mocked(getSession).mockResolvedValueOnce(mockRecruiterSession);
        vi.mocked(db.jobApplication.findFirst).mockResolvedValueOnce(
          asMock<JobApplication & { job: { title: string; recruiterId: string } }>({
            id: mockAppId,
            status: 'PENDING',
            candidateId: mockCandidateSession.userId,
            job: { title: 'Engineer', recruiterId: mockRecruiterSession.userId },
          })
        );
        vi.mocked(db.jobApplication.update).mockResolvedValueOnce(
          asMock<JobApplication>({
            id: mockAppId,
            status: 'REVIEWED',
          })
        );

        const res1 = await app.request(`/applications/${mockAppId}/status`, {
          method: 'PATCH',
          headers: {
            Cookie: 'session=valid-session',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: 'REVIEWED' }),
        });
        expect(res1.status).toBe(200);

        // REVIEWED -> SHORTLISTED
        vi.mocked(getSession).mockResolvedValueOnce(mockRecruiterSession);
        vi.mocked(db.jobApplication.findFirst).mockResolvedValueOnce(
          asMock<JobApplication & { job: { title: string; recruiterId: string } }>({
            id: mockAppId,
            status: 'REVIEWED',
            candidateId: mockCandidateSession.userId,
            job: { title: 'Engineer', recruiterId: mockRecruiterSession.userId },
          })
        );
        vi.mocked(db.jobApplication.update).mockResolvedValueOnce(
          asMock<JobApplication>({
            id: mockAppId,
            status: 'SHORTLISTED',
          })
        );

        const res2 = await app.request(`/applications/${mockAppId}/status`, {
          method: 'PATCH',
          headers: {
            Cookie: 'session=valid-session',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: 'SHORTLISTED' }),
        });
        expect(res2.status).toBe(200);

        // SHORTLISTED -> HIRED
        vi.mocked(getSession).mockResolvedValueOnce(mockRecruiterSession);
        vi.mocked(db.jobApplication.findFirst).mockResolvedValueOnce(
          asMock<JobApplication & { job: { title: string; recruiterId: string } }>({
            id: mockAppId,
            status: 'SHORTLISTED',
            candidateId: mockCandidateSession.userId,
            job: { title: 'Engineer', recruiterId: mockRecruiterSession.userId },
          })
        );
        vi.mocked(db.jobApplication.update).mockResolvedValueOnce(
          asMock<JobApplication>({
            id: mockAppId,
            status: 'HIRED',
          })
        );

        const res3 = await app.request(`/applications/${mockAppId}/status`, {
          method: 'PATCH',
          headers: {
            Cookie: 'session=valid-session',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: 'HIRED' }),
        });
        expect(res3.status).toBe(200);
      });
    });

    describe('PATCH /applications/:id/notes', () => {
      it('should update recruiter notes', async () => {
        vi.mocked(getSession).mockResolvedValueOnce(mockRecruiterSession);
        vi.mocked(db.jobApplication.findFirst).mockResolvedValueOnce(
          asMock<JobApplication & { job: { recruiterId: string } }>({
            id: mockAppId,
            job: { recruiterId: mockRecruiterSession.userId },
          })
        );
        vi.mocked(db.jobApplication.update).mockResolvedValueOnce(
          asMock<JobApplication>({
            id: mockAppId,
            notes: 'Strong candidate',
          })
        );

        const res = await app.request(`/applications/${mockAppId}/notes`, {
          method: 'PATCH',
          headers: {
            Cookie: 'session=valid-session',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ notes: 'Strong candidate' }),
        });

        expect(res.status).toBe(200);
      });
    });
  });

  describe('Admin Routes', () => {
    describe('GET /applications/admin/all', () => {
      it('should return all applications for admin', async () => {
        vi.mocked(getSession).mockResolvedValueOnce(mockAdminSession);
        vi.mocked(db.jobApplication.findMany).mockResolvedValueOnce([
          asMock<JobApplication & { job: { id: string; title: string; recruiter: { id: string } } }>({
            id: mockAppId,
            candidateId: mockCandidateSession.userId,
            job: {
              id: mockJobId,
              title: 'Engineer',
              recruiter: { id: mockRecruiterSession.userId },
            },
          }),
        ]);
        vi.mocked(db.jobApplication.count).mockResolvedValueOnce(1);
        vi.mocked(db.user.findMany).mockResolvedValueOnce([
          asMock<User>({
            id: mockCandidateSession.userId,
            email: 'candidate@test.com',
            fullName: 'Test',
          }),
        ]);

        const res = await app.request('/applications/admin/all', {
          headers: { Cookie: 'session=valid-session' },
        });

        expect(res.status).toBe(200);
        const data = await readJson<{ data: unknown[] }>(res);
        expect(data.data).toHaveLength(1);
      });

      it('should reject non-admin users', async () => {
        vi.mocked(getSession).mockResolvedValueOnce(mockRecruiterSession);

        const res = await app.request('/applications/admin/all', {
          headers: { Cookie: 'session=valid-session' },
        });

        expect(res.status).toBe(403);
      });
    });
  });
});
