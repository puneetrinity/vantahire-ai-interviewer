import { Hono } from 'hono';
import { z } from 'zod';

import { db } from '../lib/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import type { AppEnv, AuthUser } from '../types/index.js';
import { emitTo } from '../lib/socket.js';
import { JobStatus, ApprovalStatus } from '@prisma/client';

const app = new Hono<AppEnv>();

// ─────────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────────

const createJobSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  department: z.string().optional(),
  location: z.string().optional(),
  jobType: z.string().optional(),
  salaryRange: z.string().optional(),
});

const updateJobSchema = createJobSchema.partial();

// ─────────────────────────────────────────────────────────────────
// Recruiter routes
// ─────────────────────────────────────────────────────────────────

// List jobs
app.get('/', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '20');
  const status = c.req.query('status') as JobStatus | undefined;

  const where = {
    recruiterId: user.id,
    ...(status && { status }),
  };

  const [jobs, total] = await Promise.all([
    db.job.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { interviews: true, applications: true } },
      },
    }),
    db.job.count({ where }),
  ]);

  return c.json({
    data: jobs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// Get single job
app.get('/:id', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const id = c.req.param('id');

  const job = await db.job.findFirst({
    where: { id, recruiterId: user.id },
    include: {
      interviews: {
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
      applications: {
        orderBy: { appliedAt: 'desc' },
        take: 10,
      },
    },
  });

  if (!job) {
    return c.json({ error: 'Job not found' }, 404);
  }

  return c.json(job);
});

// Create job
app.post('/', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const body = await c.req.json();

  const parsed = createJobSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400);
  }

  const job = await db.job.create({
    data: {
      recruiterId: user.id,
      ...parsed.data,
    },
  });

  return c.json(job, 201);
});

// Update job
app.patch('/:id', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const id = c.req.param('id');
  const body = await c.req.json();

  const parsed = updateJobSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400);
  }

  const job = await db.job.findFirst({
    where: { id, recruiterId: user.id },
  });

  if (!job) {
    return c.json({ error: 'Job not found' }, 404);
  }

  const updated = await db.job.update({
    where: { id },
    data: parsed.data,
  });

  return c.json(updated);
});

// Delete job
app.delete('/:id', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const id = c.req.param('id');

  const job = await db.job.findFirst({
    where: { id, recruiterId: user.id },
  });

  if (!job) {
    return c.json({ error: 'Job not found' }, 404);
  }

  await db.job.delete({ where: { id } });

  return c.json({ success: true });
});

// Update job status (publish/close)
app.post('/:id/status', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const id = c.req.param('id');
  const { status } = await c.req.json() as { status: JobStatus };

  if (!['DRAFT', 'ACTIVE', 'CLOSED'].includes(status)) {
    return c.json({ error: 'Invalid status' }, 400);
  }

  const job = await db.job.findFirst({
    where: { id, recruiterId: user.id },
  });

  if (!job) {
    return c.json({ error: 'Job not found' }, 404);
  }

  // Can only publish if approved
  if (status === 'ACTIVE' && job.approvalStatus !== 'APPROVED') {
    return c.json({ error: 'Job must be approved before publishing' }, 400);
  }

  const updated = await db.job.update({
    where: { id },
    data: { status },
  });

  return c.json(updated);
});

// ─────────────────────────────────────────────────────────────────
// Admin routes (approval workflow)
// ─────────────────────────────────────────────────────────────────

// List pending approvals
app.get('/admin/pending', requireAuth, requireRole('ADMIN'), async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '20');

  const where = { approvalStatus: ApprovalStatus.PENDING };

  const [jobs, total] = await Promise.all([
    db.job.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'asc' },
      include: {
        recruiter: {
          select: { id: true, email: true, fullName: true },
        },
      },
    }),
    db.job.count({ where }),
  ]);

  return c.json({
    data: jobs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// Approve job
app.post('/admin/:id/approve', requireAuth, requireRole('ADMIN'), async (c) => {
  const user = c.get('user') as AuthUser;
  const id = c.req.param('id');

  const job = await db.job.findUnique({ where: { id } });

  if (!job) {
    return c.json({ error: 'Job not found' }, 404);
  }

  const updated = await db.job.update({
    where: { id },
    data: {
      approvalStatus: 'APPROVED',
      approvedAt: new Date(),
      approvedBy: user.id,
    },
  });

  // Emit real-time notification to recruiter
  emitTo.user(job.recruiterId, 'job:approved', { jobId: id });

  return c.json(updated);
});

// Reject job
app.post('/admin/:id/reject', requireAuth, requireRole('ADMIN'), async (c) => {
  const user = c.get('user') as AuthUser;
  const id = c.req.param('id');
  const { reason } = await c.req.json() as { reason?: string };

  const job = await db.job.findUnique({ where: { id } });

  if (!job) {
    return c.json({ error: 'Job not found' }, 404);
  }

  const updated = await db.job.update({
    where: { id },
    data: {
      approvalStatus: 'REJECTED',
      rejectionReason: reason,
    },
  });

  // Emit real-time notification to recruiter
  emitTo.user(job.recruiterId, 'job:rejected', { jobId: id, reason: reason || 'No reason provided' });

  return c.json(updated);
});

export default app;
