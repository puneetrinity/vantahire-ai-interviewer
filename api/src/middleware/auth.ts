import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { getSession } from '../lib/redis.js';
import { db } from '../lib/db.js';
import type { UserRole } from '@prisma/client';
import type { AuthUser } from '../types/index.js';

// Re-export AuthUser for backwards compatibility
export type { AuthUser };

// Session cookie name
export const SESSION_COOKIE = 'session';

/**
 * Middleware to require authentication
 * Attaches user to context if valid session exists
 */
export async function requireAuth(c: Context, next: Next) {
  const sessionId = getCookie(c, SESSION_COOKIE);

  if (!sessionId) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const session = await getSession(sessionId);
  if (!session) {
    return c.json({ error: 'Invalid or expired session' }, 401);
  }

  // Attach user to context
  c.set('user', {
    id: session.userId,
    email: session.email,
    role: session.role as UserRole,
  });

  await next();
}

/**
 * Middleware to require specific roles
 */
export function requireRole(...roles: UserRole[]) {
  return async (c: Context, next: Next) => {
    const user = c.get('user') as AuthUser | undefined;

    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    if (!roles.includes(user.role)) {
      return c.json({ error: 'Insufficient permissions' }, 403);
    }

    await next();
  };
}

// Header name for interview token
export const INTERVIEW_TOKEN_HEADER = 'X-Interview-Token';

/**
 * Middleware to validate interview session token (for candidates)
 * Checks header first (X-Interview-Token), then query param (?token=)
 * Header preferred for API calls to avoid token leakage in URLs/logs
 * Query param supported for initial page loads and WebSocket handshakes
 */
export async function requireInterviewToken(c: Context, next: Next) {
  // Header takes precedence over query param
  const token = c.req.header(INTERVIEW_TOKEN_HEADER) || c.req.query('token');

  if (!token) {
    return c.json({ error: 'Interview token required' }, 401);
  }

  // Find valid session
  const session = await db.interviewSession.findUnique({
    where: { token },
    include: { interview: true },
  });

  if (!session) {
    return c.json({ error: 'Invalid interview token' }, 401);
  }

  // Check expiry
  if (session.expiresAt < new Date()) {
    return c.json({ error: 'Interview session expired' }, 401);
  }

  // Check revocation
  if (session.revokedAt) {
    return c.json({ error: 'Interview session revoked' }, 401);
  }

  // Update access tracking
  await db.interviewSession.update({
    where: { id: session.id },
    data: {
      lastAccessedAt: new Date(),
      accessCount: { increment: 1 },
    },
  });

  // Attach interview data to context
  c.set('interviewSession', {
    sessionId: session.id,
    interviewId: session.interviewId,
    interview: session.interview,
    token, // Include resolved token for downstream use
  });

  await next();
}

/**
 * Optional interview token - attaches interview session if valid token exists
 * but doesn't require it. Useful for routes that accept both auth methods.
 */
export async function optionalInterviewToken(c: Context, next: Next) {
  const token = c.req.header(INTERVIEW_TOKEN_HEADER) || c.req.query('token');

  if (token) {
    const session = await db.interviewSession.findUnique({
      where: { token },
      include: { interview: true },
    });

    if (session && !session.revokedAt && session.expiresAt > new Date()) {
      // Update access tracking
      await db.interviewSession.update({
        where: { id: session.id },
        data: {
          lastAccessedAt: new Date(),
          accessCount: { increment: 1 },
        },
      });

      c.set('interviewSession', {
        sessionId: session.id,
        interviewId: session.interviewId,
        interview: session.interview,
        token,
      });
    }
  }

  await next();
}

/**
 * Optional auth - attaches user if session exists but doesn't require it
 */
export async function optionalAuth(c: Context, next: Next) {
  const sessionId = getCookie(c, SESSION_COOKIE);

  if (sessionId) {
    const session = await getSession(sessionId);
    if (session) {
      c.set('user', {
        id: session.userId,
        email: session.email,
        role: session.role as UserRole,
      });
    }
  }

  await next();
}
