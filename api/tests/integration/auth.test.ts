import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { User, UserRole, RecruiterProfile, CandidateProfile } from '@prisma/client';
import type { SessionData } from '../../src/lib/redis.js';
import { asMock, readJson } from '../helpers/mock.js';
import { app } from '../../src/app.js';

interface UserWithProfiles extends User {
  recruiterProfile?: Partial<RecruiterProfile> | null;
  candidateProfile?: Partial<CandidateProfile> | null;
}

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
      count: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    recruiterProfile: {
      findUnique: vi.fn(),
    },
    candidateProfile: {
      findUnique: vi.fn(),
    },
  },
}));

import { getSession, createSession, deleteSession } from '../../src/lib/redis.js';
import { db } from '../../src/lib/db.js';

describe('Auth API', () => {
  const mockSession: SessionData = {
    userId: 'user-123',
    email: 'test@example.com',
    role: 'RECRUITER',
    createdAt: Date.now(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /auth/me', () => {
    it('should return 401 without session', async () => {
      const res = await app.request('/auth/me');
      expect(res.status).toBe(401);
    });

    it('should return 401 with invalid session', async () => {
      vi.mocked(getSession).mockResolvedValueOnce(null);

      const res = await app.request('/auth/me', {
        headers: { Cookie: 'session=invalid-session' },
      });

      expect(res.status).toBe(401);
    });

    it('should return user data with valid session', async () => {
      vi.mocked(getSession).mockResolvedValueOnce(mockSession);
      vi.mocked(db.user.findUnique).mockResolvedValueOnce(
        asMock<User>({
          id: mockSession.userId,
          email: mockSession.email,
          role: mockSession.role as UserRole,
          fullName: 'Test User',
          avatarUrl: null,
          provider: 'google',
          createdAt: new Date(),
        })
      );

      const res = await app.request('/auth/me', {
        headers: { Cookie: 'session=valid-session' },
      });

      expect(res.status).toBe(200);
      const data = await readJson<{ id: string; email: string }>(res);
      // API returns user data directly, not wrapped in { user: ... }
      expect(data.id).toBeDefined();
      expect(data.email).toBe(mockSession.email);
    });

    it('should include recruiter profile if available', async () => {
      vi.mocked(getSession).mockResolvedValueOnce(mockSession);
      vi.mocked(db.user.findUnique).mockResolvedValueOnce(
        asMock<UserWithProfiles>({
          id: mockSession.userId,
          email: mockSession.email,
          role: 'RECRUITER' as UserRole,
          fullName: 'Test Recruiter',
          recruiterProfile: {
            companyName: 'Test Company',
            brandColor: '#000000',
          },
        })
      );

      const res = await app.request('/auth/me', {
        headers: { Cookie: 'session=valid-session' },
      });

      expect(res.status).toBe(200);
      const data = await readJson<{ recruiterProfile?: { companyName?: string } }>(res);
      // API returns user data directly, not wrapped in { user: ... }
      expect(data.recruiterProfile).toBeDefined();
      expect(data.recruiterProfile?.companyName).toBe('Test Company');
    });

    it('should include candidate profile if available', async () => {
      const candidateSession = { ...mockSession, role: 'CANDIDATE' };
      vi.mocked(getSession).mockResolvedValueOnce(candidateSession);
      vi.mocked(db.user.findUnique).mockResolvedValueOnce(
        asMock<UserWithProfiles>({
          id: candidateSession.userId,
          email: candidateSession.email,
          role: 'CANDIDATE' as UserRole,
          fullName: 'Test Candidate',
          candidateProfile: {
            bio: 'Experienced developer',
            skills: ['JavaScript', 'TypeScript'],
            experienceYears: 5,
          },
        })
      );

      const res = await app.request('/auth/me', {
        headers: { Cookie: 'session=valid-session' },
      });

      expect(res.status).toBe(200);
      const data = await readJson<{ candidateProfile?: { skills?: string[] } }>(res);
      // API returns user data directly, not wrapped in { user: ... }
      expect(data.candidateProfile).toBeDefined();
      expect(data.candidateProfile?.skills).toContain('JavaScript');
    });
  });

  describe('POST /auth/logout', () => {
    it('should logout and clear session', async () => {
      vi.mocked(getSession).mockResolvedValueOnce(mockSession);
      vi.mocked(deleteSession).mockResolvedValueOnce(undefined);

      const res = await app.request('/auth/logout', {
        method: 'POST',
        headers: { Cookie: 'session=valid-session' },
      });

      expect(res.status).toBe(200);
      expect(deleteSession).toHaveBeenCalled();

      // Check that Set-Cookie clears the session
      const setCookie = res.headers.get('Set-Cookie');
      expect(setCookie).toContain('session=');
    });

    it('should return 401 without session', async () => {
      const res = await app.request('/auth/logout', {
        method: 'POST',
      });

      expect(res.status).toBe(401);
    });
  });

  describe('OAuth Flows', () => {
    describe('GET /auth/google', () => {
      it('should redirect to Google OAuth', async () => {
        const res = await app.request('/auth/google');
        // OAuth routes typically redirect
        expect([302, 303, 307, 308]).toContain(res.status);
      });
    });

    describe('GET /auth/linkedin', () => {
      it('should redirect to LinkedIn OAuth', async () => {
        const res = await app.request('/auth/linkedin');
        expect([302, 303, 307, 308]).toContain(res.status);
      });
    });
  });

  describe('Session Validation', () => {
    it('should reject expired session', async () => {
      vi.mocked(getSession).mockResolvedValueOnce(null); // Expired sessions return null

      const res = await app.request('/auth/me', {
        headers: { Cookie: 'session=expired-session' },
      });

      expect(res.status).toBe(401);
    });

    it('should handle missing user in database', async () => {
      vi.mocked(getSession).mockResolvedValueOnce(mockSession);
      vi.mocked(db.user.findUnique).mockResolvedValueOnce(null);

      const res = await app.request('/auth/me', {
        headers: { Cookie: 'session=valid-session' },
      });

      // Should return 404 or similar when user not found
      expect([404, 401]).toContain(res.status);
    });
  });
});

describe('Auth Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('requireAuth', () => {
    it('should allow authenticated requests', async () => {
      const mockSession: SessionData = {
        userId: 'user-123',
        email: 'test@example.com',
        role: 'RECRUITER',
        createdAt: Date.now(),
      };
      vi.mocked(getSession).mockResolvedValueOnce(mockSession);

      // Use a protected endpoint
      vi.mocked(db.job.findMany).mockResolvedValueOnce([]);
      vi.mocked(db.job.count).mockResolvedValueOnce(0);

      const res = await app.request('/jobs', {
        headers: { Cookie: 'session=valid-session' },
      });

      expect(res.status).toBe(200);
    });

    it('should reject unauthenticated requests', async () => {
      const res = await app.request('/jobs');
      expect(res.status).toBe(401);
    });
  });

  describe('requireRole', () => {
    it('should allow correct role', async () => {
      const adminSession = {
        userId: 'admin-123',
        email: 'admin@example.com',
        role: 'ADMIN',
        createdAt: Date.now(),
      };
      vi.mocked(getSession).mockResolvedValueOnce(adminSession);

      vi.mocked(db.job.findMany).mockResolvedValueOnce([]);
      vi.mocked(db.job.count).mockResolvedValueOnce(0);

      const res = await app.request('/jobs/admin/pending', {
        headers: { Cookie: 'session=admin-session' },
      });

      expect(res.status).toBe(200);
    });

    it('should reject wrong role', async () => {
      const recruiterSession = {
        userId: 'recruiter-123',
        email: 'recruiter@example.com',
        role: 'RECRUITER',
        createdAt: Date.now(),
      };
      vi.mocked(getSession).mockResolvedValueOnce(recruiterSession);

      const res = await app.request('/jobs/admin/pending', {
        headers: { Cookie: 'session=recruiter-session' },
      });

      expect(res.status).toBe(403);
    });
  });
});
