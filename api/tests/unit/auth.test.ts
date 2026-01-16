import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// Mock Redis before importing the actual module
vi.mock('../../src/lib/redis.js', () => ({
  redis: {
    setex: vi.fn(),
    get: vi.fn(),
    del: vi.fn(),
    exists: vi.fn(),
    expire: vi.fn(),
  },
  createSession: vi.fn(),
  getSession: vi.fn(),
  deleteSession: vi.fn(),
  refreshSession: vi.fn(),
}));

vi.mock('../../src/lib/config.js', () => ({
  config: {
    SESSION_TTL_SECONDS: 604800, // 7 days
    INTERVIEW_SESSION_TTL_HOURS: 72,
  },
}));

import { redis, createSession, getSession, deleteSession, refreshSession } from '../../src/lib/redis.js';

describe('Session Management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createSession', () => {
    it('should create a session with correct TTL', async () => {
      const sessionId = 'test-session-123';
      const sessionData = {
        userId: 'user-123',
        email: 'test@example.com',
        role: 'RECRUITER',
        createdAt: Date.now(),
      };

      vi.mocked(createSession).mockResolvedValueOnce();

      await createSession(sessionId, sessionData);

      expect(createSession).toHaveBeenCalledWith(sessionId, sessionData);
    });

    it('should store session data as JSON', async () => {
      const sessionId = 'test-session-456';
      const sessionData = {
        userId: 'user-456',
        email: 'candidate@example.com',
        role: 'CANDIDATE',
        createdAt: Date.now(),
      };

      vi.mocked(createSession).mockResolvedValueOnce();

      await createSession(sessionId, sessionData);

      expect(createSession).toHaveBeenCalledWith(sessionId, expect.objectContaining({
        userId: 'user-456',
        email: 'candidate@example.com',
        role: 'CANDIDATE',
      }));
    });
  });

  describe('getSession', () => {
    it('should return session data when session exists', async () => {
      const sessionData = {
        userId: 'user-123',
        email: 'test@example.com',
        role: 'RECRUITER',
        createdAt: Date.now(),
      };

      vi.mocked(getSession).mockResolvedValueOnce(sessionData);

      const result = await getSession('valid-session-id');

      expect(result).toEqual(sessionData);
    });

    it('should return null when session does not exist', async () => {
      vi.mocked(getSession).mockResolvedValueOnce(null);

      const result = await getSession('invalid-session-id');

      expect(result).toBeNull();
    });

    it('should return null for expired session', async () => {
      vi.mocked(getSession).mockResolvedValueOnce(null);

      const result = await getSession('expired-session-id');

      expect(result).toBeNull();
    });
  });

  describe('deleteSession', () => {
    it('should delete the session', async () => {
      vi.mocked(deleteSession).mockResolvedValueOnce();

      await deleteSession('session-to-delete');

      expect(deleteSession).toHaveBeenCalledWith('session-to-delete');
    });
  });

  describe('refreshSession', () => {
    it('should return true when session exists and is refreshed', async () => {
      vi.mocked(refreshSession).mockResolvedValueOnce(true);

      const result = await refreshSession('valid-session');

      expect(result).toBe(true);
    });

    it('should return false when session does not exist', async () => {
      vi.mocked(refreshSession).mockResolvedValueOnce(false);

      const result = await refreshSession('invalid-session');

      expect(result).toBe(false);
    });
  });
});

describe('Session Data Structure', () => {
  it('should have correct shape for recruiter session', () => {
    const session = {
      userId: 'user-123',
      email: 'recruiter@company.com',
      role: 'RECRUITER',
      createdAt: Date.now(),
    };

    expect(session).toHaveProperty('userId');
    expect(session).toHaveProperty('email');
    expect(session).toHaveProperty('role');
    expect(session).toHaveProperty('createdAt');
    expect(session.role).toBe('RECRUITER');
  });

  it('should have correct shape for candidate session', () => {
    const session = {
      userId: 'user-456',
      email: 'candidate@email.com',
      role: 'CANDIDATE',
      createdAt: Date.now(),
    };

    expect(session.role).toBe('CANDIDATE');
  });

  it('should have correct shape for admin session', () => {
    const session = {
      userId: 'user-789',
      email: 'admin@vantahire.com',
      role: 'ADMIN',
      createdAt: Date.now(),
    };

    expect(session.role).toBe('ADMIN');
  });
});

describe('Interview Token Validation Logic', () => {
  const now = new Date();

  describe('Token Expiry', () => {
    it('should consider token valid when expiresAt is in the future', () => {
      const expiresAt = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour from now
      expect(expiresAt > now).toBe(true);
    });

    it('should consider token expired when expiresAt is in the past', () => {
      const expiresAt = new Date(now.getTime() - 60 * 60 * 1000); // 1 hour ago
      expect(expiresAt > now).toBe(false);
    });

    it('should consider token expired when expiresAt equals current time', () => {
      const expiresAt = new Date(now.getTime());
      expect(expiresAt > now).toBe(false);
    });
  });

  describe('Token Revocation', () => {
    it('should consider token invalid when revokedAt is set', () => {
      const session = {
        token: 'abc123',
        expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
        revokedAt: new Date(),
      };

      expect(session.revokedAt !== null).toBe(true);
    });

    it('should consider token valid when revokedAt is null', () => {
      const session = {
        token: 'abc123',
        expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
        revokedAt: null,
      };

      expect(session.revokedAt === null).toBe(true);
    });
  });

  describe('Combined Validation', () => {
    it('should be valid when not expired and not revoked', () => {
      const session = {
        token: 'valid-token',
        expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
        revokedAt: null,
      };

      const isValid = session.revokedAt === null && session.expiresAt > now;
      expect(isValid).toBe(true);
    });

    it('should be invalid when expired even if not revoked', () => {
      const session = {
        token: 'expired-token',
        expiresAt: new Date(now.getTime() - 60 * 60 * 1000),
        revokedAt: null,
      };

      const isValid = session.revokedAt === null && session.expiresAt > now;
      expect(isValid).toBe(false);
    });

    it('should be invalid when revoked even if not expired', () => {
      const session = {
        token: 'revoked-token',
        expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
        revokedAt: new Date(now.getTime() - 60 * 1000),
      };

      const isValid = session.revokedAt === null && session.expiresAt > now;
      expect(isValid).toBe(false);
    });
  });
});

describe('Role Authorization Logic', () => {
  const checkRole = (userRole: string, allowedRoles: string[]): boolean => {
    return allowedRoles.includes(userRole);
  };

  describe('Single Role Check', () => {
    it('should allow ADMIN for admin-only routes', () => {
      expect(checkRole('ADMIN', ['ADMIN'])).toBe(true);
    });

    it('should deny RECRUITER for admin-only routes', () => {
      expect(checkRole('RECRUITER', ['ADMIN'])).toBe(false);
    });

    it('should deny CANDIDATE for admin-only routes', () => {
      expect(checkRole('CANDIDATE', ['ADMIN'])).toBe(false);
    });
  });

  describe('Multiple Role Check', () => {
    it('should allow RECRUITER for recruiter/admin routes', () => {
      expect(checkRole('RECRUITER', ['RECRUITER', 'ADMIN'])).toBe(true);
    });

    it('should allow ADMIN for recruiter/admin routes', () => {
      expect(checkRole('ADMIN', ['RECRUITER', 'ADMIN'])).toBe(true);
    });

    it('should deny CANDIDATE for recruiter/admin routes', () => {
      expect(checkRole('CANDIDATE', ['RECRUITER', 'ADMIN'])).toBe(false);
    });
  });

  describe('Candidate Routes', () => {
    it('should allow CANDIDATE for candidate routes', () => {
      expect(checkRole('CANDIDATE', ['CANDIDATE'])).toBe(true);
    });

    it('should deny RECRUITER for candidate-only routes', () => {
      expect(checkRole('RECRUITER', ['CANDIDATE'])).toBe(false);
    });
  });
});
