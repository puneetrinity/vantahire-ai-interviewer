import { Hono } from 'hono';
import { z } from 'zod';

import { db } from '../lib/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import type { AppEnv, AuthUser } from '../types/index.js';

const app = new Hono<AppEnv>();

// ─────────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────────

const updateProfileSchema = z.object({
  fullName: z.string().min(1).max(100).optional(),
});

const updateRecruiterProfileSchema = z.object({
  companyName: z.string().max(200).optional(),
  logoFileId: z.string().uuid().optional().nullable(),
  brandColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  emailIntro: z.string().max(1000).optional(),
  emailTips: z.string().max(2000).optional(),
  emailCtaText: z.string().max(100).optional(),
});

const updateCandidateProfileSchema = z.object({
  fullName: z.string().max(100).optional(),
  phone: z.string().max(20).optional(),
  bio: z.string().max(2000).optional(),
  skills: z.array(z.string()).optional(),
  experienceYears: z.number().min(0).max(50).optional(),
  resumeFileId: z.string().uuid().optional().nullable(),
  linkedinUrl: z.string().url().optional().nullable(),
  portfolioUrl: z.string().url().optional().nullable(),
});

// ─────────────────────────────────────────────────────────────────
// Profile routes
// ─────────────────────────────────────────────────────────────────

// Update basic profile
app.patch('/profile', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const body = await c.req.json();

  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400);
  }

  const updated = await db.user.update({
    where: { id: user.id },
    data: parsed.data,
  });

  return c.json({
    id: updated.id,
    email: updated.email,
    fullName: updated.fullName,
    avatarUrl: updated.avatarUrl,
    role: updated.role,
  });
});

// Get recruiter profile
app.get('/recruiter-profile', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;

  const profile = await db.recruiterProfile.findUnique({
    where: { userId: user.id },
  });

  if (!profile) {
    // Create default profile if doesn't exist
    const newProfile = await db.recruiterProfile.create({
      data: { userId: user.id },
    });
    return c.json(newProfile);
  }

  return c.json(profile);
});

// Update recruiter profile
app.patch('/recruiter-profile', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const body = await c.req.json();

  const parsed = updateRecruiterProfileSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400);
  }

  const profile = await db.recruiterProfile.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      ...parsed.data,
    },
    update: parsed.data,
  });

  return c.json(profile);
});

// Get candidate profile
app.get('/candidate-profile', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;

  const profile = await db.candidateProfile.findUnique({
    where: { userId: user.id },
  });

  if (!profile) {
    const newProfile = await db.candidateProfile.create({
      data: { userId: user.id },
    });
    return c.json(newProfile);
  }

  return c.json(profile);
});

// Update candidate profile
app.patch('/candidate-profile', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const body = await c.req.json();

  const parsed = updateCandidateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400);
  }

  const profile = await db.candidateProfile.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      ...parsed.data,
    },
    update: parsed.data,
  });

  return c.json(profile);
});

// ─────────────────────────────────────────────────────────────────
// Admin routes
// ─────────────────────────────────────────────────────────────────

// List all users (admin only)
app.get('/', requireAuth, requireRole('ADMIN'), async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '20');
  const search = c.req.query('search');

  const where = search
    ? {
        OR: [
          { email: { contains: search, mode: 'insensitive' as const } },
          { fullName: { contains: search, mode: 'insensitive' as const } },
        ],
      }
    : {};

  const [users, total] = await Promise.all([
    db.user.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        fullName: true,
        avatarUrl: true,
        role: true,
        provider: true,
        createdAt: true,
        _count: { select: { interviews: true, jobs: true } },
      },
    }),
    db.user.count({ where }),
  ]);

  return c.json({
    data: users,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// Get user by ID (admin only)
app.get('/:id', requireAuth, requireRole('ADMIN'), async (c) => {
  const id = c.req.param('id');

  const user = await db.user.findUnique({
    where: { id },
    include: {
      recruiterProfile: true,
      candidateProfile: true,
      _count: { select: { interviews: true, jobs: true } },
    },
  });

  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json(user);
});

// Update user role (admin only)
app.patch('/:id/role', requireAuth, requireRole('ADMIN'), async (c) => {
  const id = c.req.param('id');
  const { role } = await c.req.json() as { role: string };

  if (!['RECRUITER', 'CANDIDATE', 'ADMIN'].includes(role)) {
    return c.json({ error: 'Invalid role' }, 400);
  }

  const user = await db.user.update({
    where: { id },
    data: { role: role as 'RECRUITER' | 'CANDIDATE' | 'ADMIN' },
  });

  return c.json({
    id: user.id,
    email: user.email,
    role: user.role,
  });
});

export default app;
