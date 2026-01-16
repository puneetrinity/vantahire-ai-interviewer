import { describe, expect, it, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { app } from '../../src/app.js';
import type { Job } from '@prisma/client';
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
    job: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    interview: {
      findMany: vi.fn(),
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

interface JobWithCounts extends Job {
  _count?: { interviews: number; applications: number };
  interviews?: unknown[];
  applications?: unknown[];
}

interface PaginatedResponse<T> {
  data: T[];
  pagination: { total: number; page: number; pageSize: number };
}

describe('Jobs API', () => {
  const mockRecruiterSession = {
    userId: 'recruiter-123',
    email: 'recruiter@test.com',
    role: 'RECRUITER',
    createdAt: Date.now(),
  };

  const mockAdminSession = {
    userId: 'admin-123',
    email: 'admin@test.com',
    role: 'ADMIN',
    createdAt: Date.now(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /jobs', () => {
    it('should return 401 without authentication', async () => {
      const res = await app.request('/jobs');
      expect(res.status).toBe(401);
    });

    it('should return jobs for authenticated recruiter', async () => {
      vi.mocked(getSession).mockResolvedValueOnce(mockRecruiterSession);
      vi.mocked(db.job.findMany).mockResolvedValueOnce([
        asMock<JobWithCounts>({
          id: 'job-1',
          title: 'Software Engineer',
          recruiterId: mockRecruiterSession.userId,
          status: 'DRAFT',
          _count: { interviews: 0, applications: 0 },
        }),
      ]);
      vi.mocked(db.job.count).mockResolvedValueOnce(1);

      const res = await app.request('/jobs', {
        headers: { Cookie: 'session=valid-session' },
      });

      expect(res.status).toBe(200);
      const data = await readJson<PaginatedResponse<Job>>(res);
      expect(data.data).toHaveLength(1);
      expect(data.pagination.total).toBe(1);
    });

    it('should filter by status', async () => {
      vi.mocked(getSession).mockResolvedValueOnce(mockRecruiterSession);
      vi.mocked(db.job.findMany).mockResolvedValueOnce([]);
      vi.mocked(db.job.count).mockResolvedValueOnce(0);

      const res = await app.request('/jobs?status=ACTIVE', {
        headers: { Cookie: 'session=valid-session' },
      });

      expect(res.status).toBe(200);
      expect(db.job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'ACTIVE',
          }),
        })
      );
    });
  });

  describe('POST /jobs', () => {
    it('should create a new job', async () => {
      vi.mocked(getSession).mockResolvedValueOnce(mockRecruiterSession);
      vi.mocked(db.job.create).mockResolvedValueOnce(
        asMock<Job>({
          id: 'new-job-id',
          title: 'Senior Engineer',
          recruiterId: mockRecruiterSession.userId,
          status: 'DRAFT',
          approvalStatus: 'PENDING',
        })
      );

      const res = await app.request('/jobs', {
        method: 'POST',
        headers: {
          Cookie: 'session=valid-session',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Senior Engineer',
          description: 'Build great things',
        }),
      });

      expect(res.status).toBe(201);
      const data = await readJson<Job>(res);
      expect(data.id).toBe('new-job-id');
    });

    it('should reject invalid input', async () => {
      vi.mocked(getSession).mockResolvedValueOnce(mockRecruiterSession);

      const res = await app.request('/jobs', {
        method: 'POST',
        headers: {
          Cookie: 'session=valid-session',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: '', // Empty title
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should reject without authentication', async () => {
      const res = await app.request('/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test Job' }),
      });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /jobs/:id', () => {
    it('should return job details for owner', async () => {
      vi.mocked(getSession).mockResolvedValueOnce(mockRecruiterSession);
      vi.mocked(db.job.findFirst).mockResolvedValueOnce(
        asMock<JobWithCounts>({
          id: 'job-1',
          title: 'Software Engineer',
          recruiterId: mockRecruiterSession.userId,
          interviews: [],
          applications: [],
        })
      );

      const res = await app.request('/jobs/job-1', {
        headers: { Cookie: 'session=valid-session' },
      });

      expect(res.status).toBe(200);
      const data = await readJson<Job>(res);
      expect(data.id).toBe('job-1');
    });

    it('should return 404 for non-existent job', async () => {
      vi.mocked(getSession).mockResolvedValueOnce(mockRecruiterSession);
      vi.mocked(db.job.findFirst).mockResolvedValueOnce(null);

      const res = await app.request('/jobs/non-existent', {
        headers: { Cookie: 'session=valid-session' },
      });

      expect(res.status).toBe(404);
    });

    it('should return 404 for job owned by another user', async () => {
      vi.mocked(getSession).mockResolvedValueOnce(mockRecruiterSession);
      vi.mocked(db.job.findFirst).mockResolvedValueOnce(null); // findFirst returns null because of recruiterId filter

      const res = await app.request('/jobs/other-user-job', {
        headers: { Cookie: 'session=valid-session' },
      });

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /jobs/:id', () => {
    it('should update job', async () => {
      vi.mocked(getSession).mockResolvedValueOnce(mockRecruiterSession);
      vi.mocked(db.job.findFirst).mockResolvedValueOnce(
        asMock<Job>({
          id: 'job-1',
          title: 'Old Title',
          recruiterId: mockRecruiterSession.userId,
        })
      );
      vi.mocked(db.job.update).mockResolvedValueOnce(
        asMock<Job>({
          id: 'job-1',
          title: 'New Title',
          recruiterId: mockRecruiterSession.userId,
        })
      );

      const res = await app.request('/jobs/job-1', {
        method: 'PATCH',
        headers: {
          Cookie: 'session=valid-session',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: 'New Title' }),
      });

      expect(res.status).toBe(200);
      const data = await readJson<Job>(res);
      expect(data.title).toBe('New Title');
    });
  });

  describe('DELETE /jobs/:id', () => {
    it('should delete job', async () => {
      vi.mocked(getSession).mockResolvedValueOnce(mockRecruiterSession);
      vi.mocked(db.job.findFirst).mockResolvedValueOnce(
        asMock<Job>({
          id: 'job-1',
          recruiterId: mockRecruiterSession.userId,
        })
      );
      vi.mocked(db.job.delete).mockResolvedValueOnce(asMock<Job>({ id: 'job-1' }));

      const res = await app.request('/jobs/job-1', {
        method: 'DELETE',
        headers: { Cookie: 'session=valid-session' },
      });

      expect(res.status).toBe(200);
    });
  });

  describe('POST /jobs/:id/status', () => {
    it('should reject publishing unapproved job', async () => {
      vi.mocked(getSession).mockResolvedValueOnce(mockRecruiterSession);
      vi.mocked(db.job.findFirst).mockResolvedValueOnce(
        asMock<Job>({
          id: 'job-1',
          recruiterId: mockRecruiterSession.userId,
          approvalStatus: 'PENDING',
        })
      );

      const res = await app.request('/jobs/job-1/status', {
        method: 'POST',
        headers: {
          Cookie: 'session=valid-session',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'ACTIVE' }),
      });

      expect(res.status).toBe(400);
      const data = await readJson<{ error: string }>(res);
      expect(data.error).toContain('approved');
    });

    it('should allow publishing approved job', async () => {
      vi.mocked(getSession).mockResolvedValueOnce(mockRecruiterSession);
      vi.mocked(db.job.findFirst).mockResolvedValueOnce(
        asMock<Job>({
          id: 'job-1',
          recruiterId: mockRecruiterSession.userId,
          approvalStatus: 'APPROVED',
        })
      );
      vi.mocked(db.job.update).mockResolvedValueOnce(
        asMock<Job>({
          id: 'job-1',
          status: 'ACTIVE',
        })
      );

      const res = await app.request('/jobs/job-1/status', {
        method: 'POST',
        headers: {
          Cookie: 'session=valid-session',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'ACTIVE' }),
      });

      expect(res.status).toBe(200);
    });

    it('should reject invalid status', async () => {
      vi.mocked(getSession).mockResolvedValueOnce(mockRecruiterSession);

      const res = await app.request('/jobs/job-1/status', {
        method: 'POST',
        headers: {
          Cookie: 'session=valid-session',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'INVALID' }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('Admin Routes', () => {
    describe('GET /jobs/admin/pending', () => {
      it('should return 403 for non-admin', async () => {
        vi.mocked(getSession).mockResolvedValueOnce(mockRecruiterSession);

        const res = await app.request('/jobs/admin/pending', {
          headers: { Cookie: 'session=valid-session' },
        });

        expect(res.status).toBe(403);
      });

      it('should return pending jobs for admin', async () => {
        vi.mocked(getSession).mockResolvedValueOnce(mockAdminSession);
        vi.mocked(db.job.findMany).mockResolvedValueOnce([]);
        vi.mocked(db.job.count).mockResolvedValueOnce(0);

        const res = await app.request('/jobs/admin/pending', {
          headers: { Cookie: 'session=valid-session' },
        });

        expect(res.status).toBe(200);
      });
    });

    describe('POST /jobs/admin/:id/approve', () => {
      it('should approve job', async () => {
        vi.mocked(getSession).mockResolvedValueOnce(mockAdminSession);
        vi.mocked(db.job.findUnique).mockResolvedValueOnce(
          asMock<Job>({
            id: 'job-1',
            recruiterId: 'recruiter-123',
          })
        );
        vi.mocked(db.job.update).mockResolvedValueOnce(
          asMock<Job>({
            id: 'job-1',
            approvalStatus: 'APPROVED',
            approvedBy: mockAdminSession.userId,
          })
        );

        const res = await app.request('/jobs/admin/job-1/approve', {
          method: 'POST',
          headers: { Cookie: 'session=valid-session' },
        });

        expect(res.status).toBe(200);
        expect(emitTo.user).toHaveBeenCalledWith(
          'recruiter-123',
          'job:approved',
          expect.any(Object)
        );
      });
    });

    describe('POST /jobs/admin/:id/reject', () => {
      it('should reject job with reason', async () => {
        vi.mocked(getSession).mockResolvedValueOnce(mockAdminSession);
        vi.mocked(db.job.findUnique).mockResolvedValueOnce(
          asMock<Job>({
            id: 'job-1',
            recruiterId: 'recruiter-123',
          })
        );
        vi.mocked(db.job.update).mockResolvedValueOnce(
          asMock<Job>({
            id: 'job-1',
            approvalStatus: 'REJECTED',
            rejectionReason: 'Does not meet guidelines',
          })
        );

        const res = await app.request('/jobs/admin/job-1/reject', {
          method: 'POST',
          headers: {
            Cookie: 'session=valid-session',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ reason: 'Does not meet guidelines' }),
        });

        expect(res.status).toBe(200);
        expect(emitTo.user).toHaveBeenCalledWith(
          'recruiter-123',
          'job:rejected',
          expect.objectContaining({ reason: 'Does not meet guidelines' })
        );
      });
    });
  });
});
