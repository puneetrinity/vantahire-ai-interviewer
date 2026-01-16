import { Hono } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import { Google, LinkedIn, generateState, generateCodeVerifier } from 'arctic';
import { z } from 'zod';
import { nanoid } from 'nanoid';

import { config } from '../lib/config.js';
import { db } from '../lib/db.js';
import { redis, createSession, deleteSession } from '../lib/redis.js';
import { requireAuth, SESSION_COOKIE } from '../middleware/auth.js';
import type { AppEnv } from '../types/index.js';

const app = new Hono<AppEnv>();

// OAuth providers
const google = new Google(
  config.GOOGLE_CLIENT_ID,
  config.GOOGLE_CLIENT_SECRET,
  `${config.API_URL}/auth/google/callback`
);

const linkedin = new LinkedIn(
  config.LINKEDIN_CLIENT_ID,
  config.LINKEDIN_CLIENT_SECRET,
  `${config.API_URL}/auth/linkedin/callback`
);

// Cookie options
const cookieOptions = {
  httpOnly: true,
  secure: config.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: config.SESSION_TTL_SECONDS,
};

const testLoginSchema = z.object({
  email: z.string().email(),
  role: z.enum(['RECRUITER', 'CANDIDATE', 'ADMIN']),
  fullName: z.string().max(100).optional(),
});

// ─────────────────────────────────────────────────────────────────
// Google OAuth
// ─────────────────────────────────────────────────────────────────

app.get('/google', async (c) => {
  const state = generateState();
  const codeVerifier = generateCodeVerifier();

  // Store state and verifier in Redis (5 min TTL)
  await redis.setex(`oauth:google:${state}`, 300, codeVerifier);

  const url = google.createAuthorizationURL(state, codeVerifier, [
    'openid',
    'email',
    'profile',
  ]);

  return c.redirect(url.toString());
});

app.get('/google/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');

  if (!code || !state) {
    return c.redirect(`${config.CLIENT_URL}/auth/error?error=missing_params`);
  }

  // Retrieve and delete code verifier
  const codeVerifier = await redis.get(`oauth:google:${state}`);
  await redis.del(`oauth:google:${state}`);

  if (!codeVerifier) {
    return c.redirect(`${config.CLIENT_URL}/auth/error?error=invalid_state`);
  }

  try {
    const tokens = await google.validateAuthorizationCode(code, codeVerifier);

    // Fetch user info from Google
    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.accessToken()}` },
    });
    const userInfo = (await userInfoRes.json()) as {
      id: string;
      email: string;
      name: string;
      picture: string;
    };

    // Find or create user
    const user = await db.user.upsert({
      where: {
        provider_providerId: {
          provider: 'google',
          providerId: userInfo.id,
        },
      },
      create: {
        email: userInfo.email,
        provider: 'google',
        providerId: userInfo.id,
        fullName: userInfo.name,
        avatarUrl: userInfo.picture,
      },
      update: {
        fullName: userInfo.name,
        avatarUrl: userInfo.picture,
      },
    });

    // Create session
    const sessionId = nanoid(32);
    await createSession(sessionId, {
      userId: user.id,
      email: user.email,
      role: user.role,
      createdAt: Date.now(),
    });

    // Set session cookie
    setCookie(c, SESSION_COOKIE, sessionId, cookieOptions);

    return c.redirect(`${config.CLIENT_URL}/dashboard`);
  } catch (error) {
    console.error('Google OAuth error:', error);
    return c.redirect(`${config.CLIENT_URL}/auth/error?error=oauth_failed`);
  }
});

// ─────────────────────────────────────────────────────────────────
// LinkedIn OAuth
// ─────────────────────────────────────────────────────────────────

app.get('/linkedin', async (c) => {
  const state = generateState();

  // Store state in Redis (5 min TTL)
  await redis.setex(`oauth:linkedin:${state}`, 300, '1');

  const url = linkedin.createAuthorizationURL(state, [
    'openid',
    'profile',
    'email',
  ]);

  return c.redirect(url.toString());
});

app.get('/linkedin/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');

  if (!code || !state) {
    return c.redirect(`${config.CLIENT_URL}/auth/error?error=missing_params`);
  }

  // Verify state
  const storedState = await redis.get(`oauth:linkedin:${state}`);
  await redis.del(`oauth:linkedin:${state}`);

  if (!storedState) {
    return c.redirect(`${config.CLIENT_URL}/auth/error?error=invalid_state`);
  }

  try {
    const tokens = await linkedin.validateAuthorizationCode(code);

    // Fetch user info from LinkedIn
    const userInfoRes = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.accessToken()}` },
    });
    const userInfo = (await userInfoRes.json()) as {
      sub: string;
      email: string;
      name: string;
      picture?: string;
    };

    // Find or create user
    const user = await db.user.upsert({
      where: {
        provider_providerId: {
          provider: 'linkedin',
          providerId: userInfo.sub,
        },
      },
      create: {
        email: userInfo.email,
        provider: 'linkedin',
        providerId: userInfo.sub,
        fullName: userInfo.name,
        avatarUrl: userInfo.picture,
      },
      update: {
        fullName: userInfo.name,
        avatarUrl: userInfo.picture,
      },
    });

    // Create session
    const sessionId = nanoid(32);
    await createSession(sessionId, {
      userId: user.id,
      email: user.email,
      role: user.role,
      createdAt: Date.now(),
    });

    // Set session cookie
    setCookie(c, SESSION_COOKIE, sessionId, cookieOptions);

    return c.redirect(`${config.CLIENT_URL}/dashboard`);
  } catch (error) {
    console.error('LinkedIn OAuth error:', error);
    return c.redirect(`${config.CLIENT_URL}/auth/error?error=oauth_failed`);
  }
});

// ─────────────────────────────────────────────────────────────────
// Session management
// ─────────────────────────────────────────────────────────────────

app.get('/me', requireAuth, async (c) => {
  const user = c.get('user');

  const fullUser = await db.user.findUnique({
    where: { id: user.id },
    include: {
      recruiterProfile: true,
      candidateProfile: true,
    },
  });

  if (!fullUser) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json({
    id: fullUser.id,
    email: fullUser.email,
    role: fullUser.role,
    fullName: fullUser.fullName,
    avatarUrl: fullUser.avatarUrl,
    recruiterProfile: fullUser.recruiterProfile,
    candidateProfile: fullUser.candidateProfile,
  });
});

app.post('/logout', requireAuth, async (c) => {
  const sessionId = c.req.header('cookie')?.match(/session=([^;]+)/)?.[1];

  if (sessionId) {
    await deleteSession(sessionId);
  }

  deleteCookie(c, SESSION_COOKIE, { path: '/' });

  return c.json({ success: true });
});

// ─────────────────────────────────────────────────────────────────
// Test login (non-production only)
// ─────────────────────────────────────────────────────────────────

app.post('/test-login', async (c) => {
  if (config.NODE_ENV === 'production' || !config.E2E_AUTH_TOKEN) {
    return c.json({ error: 'Not found' }, 404);
  }

  const token =
    c.req.header('X-Test-Token') ||
    c.req.header('Authorization')?.replace(/^Bearer\s+/i, '');

  if (!token || token !== config.E2E_AUTH_TOKEN) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = testLoginSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400);
  }

  const { email, role, fullName } = parsed.data;

  let user = await db.user.findUnique({ where: { email } });
  if (!user) {
    user = await db.user.create({
      data: {
        email,
        role,
        fullName,
        provider: 'test',
        providerId: `test-${email}`,
      },
    });
  } else if (user.role !== role || (fullName && user.fullName !== fullName)) {
    user = await db.user.update({
      where: { id: user.id },
      data: {
        role,
        fullName: fullName ?? user.fullName,
      },
    });
  }

  if (role === 'RECRUITER' || role === 'ADMIN') {
    await db.recruiterProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    });
  } else if (role === 'CANDIDATE') {
    await db.candidateProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    });
  }

  const sessionId = nanoid(32);
  await createSession(sessionId, {
    userId: user.id,
    email: user.email,
    role: user.role,
    createdAt: Date.now(),
  });

  setCookie(c, SESSION_COOKIE, sessionId, cookieOptions);

  return c.json({
    id: user.id,
    email: user.email,
    role: user.role,
    fullName: user.fullName,
  });
});

export default app;
