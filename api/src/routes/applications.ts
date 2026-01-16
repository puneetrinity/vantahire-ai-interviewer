import { Hono } from 'hono';
import { z } from 'zod';

import { db } from '../lib/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import type { AppEnv, AuthUser } from '../types/index.js';
import { emitTo } from '../lib/socket.js';
import { ApplicationStatus } from '@prisma/client';
import {
  APPLICATION_TRANSITIONS,
  isValidApplicationTransition,
  canWithdrawApplication,
  canUpdateApplication,
} from '../lib/rules/status-transitions.js';

const app = new Hono<AppEnv>();

// ─────────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────────

const createApplicationSchema = z.object({
  jobId: z.string().uuid(),
  coverLetter: z.string().max(5000).optional(),
  notes: z.string().max(2000).optional(),
});

const updateApplicationSchema = z.object({
  coverLetter: z.string().max(5000).optional(),
  notes: z.string().max(2000).optional(),
});

const updateStatusSchema = z.object({
  status: z.nativeEnum(ApplicationStatus),
});

// ─────────────────────────────────────────────────────────────────
// Candidate routes - apply for jobs
// ─────────────────────────────────────────────────────────────────

// List my applications (as candidate)
app.get('/mine', requireAuth, requireRole('CANDIDATE'), async (c) => {
  const user = c.get('user') as AuthUser;
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '20');
  const status = c.req.query('status') as ApplicationStatus | undefined;

  const where = {
    candidateId: user.id,
    ...(status && { status }),
  };

  const [applications, total] = await Promise.all([
    db.jobApplication.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { appliedAt: 'desc' },
      include: {
        job: {
          select: {
            id: true,
            title: true,
            department: true,
            location: true,
            recruiter: { select: { id: true, fullName: true } },
          },
        },
        resumeFile: { select: { id: true, name: true } },
      },
    }),
    db.jobApplication.count({ where }),
  ]);

  return c.json({
    data: applications,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// Apply for a job (as candidate)
app.post('/', requireAuth, requireRole('CANDIDATE'), async (c) => {
  const user = c.get('user') as AuthUser;
  const body = await c.req.json();

  const parsed = createApplicationSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400);
  }

  const { jobId, coverLetter, notes } = parsed.data;

  // Check job exists and is active
  const job = await db.job.findUnique({
    where: { id: jobId },
    select: { id: true, status: true, recruiterId: true },
  });

  if (!job) {
    return c.json({ error: 'Job not found' }, 404);
  }

  if (job.status !== 'ACTIVE') {
    return c.json({ error: 'Job is not accepting applications' }, 400);
  }

  // Check for existing application
  const existing = await db.jobApplication.findFirst({
    where: { jobId, candidateId: user.id },
  });

  if (existing) {
    return c.json({ error: 'You have already applied for this job' }, 400);
  }

  // Get candidate's profile resume if they have one
  const candidateProfile = await db.candidateProfile.findUnique({
    where: { userId: user.id },
    select: { resumeFileId: true },
  });

  const application = await db.jobApplication.create({
    data: {
      jobId,
      candidateId: user.id,
      coverLetter,
      notes,
      resumeFileId: candidateProfile?.resumeFileId || null,
    },
    include: {
      job: { select: { id: true, title: true } },
    },
  });

  // Notify recruiter of new application
  emitTo.user(job.recruiterId, 'application:new', {
    applicationId: application.id,
    jobId: application.jobId,
    jobTitle: application.job.title,
  });

  return c.json(application, 201);
});

// Get my application details
app.get('/mine/:id', requireAuth, requireRole('CANDIDATE'), async (c) => {
  const user = c.get('user') as AuthUser;
  const id = c.req.param('id');

  const application = await db.jobApplication.findFirst({
    where: { id, candidateId: user.id },
    include: {
      job: {
        select: {
          id: true,
          title: true,
          description: true,
          department: true,
          location: true,
          jobType: true,
          recruiter: { select: { id: true, fullName: true } },
        },
      },
      resumeFile: { select: { id: true, name: true, mimeType: true } },
      files: {
        select: { id: true, name: true, mimeType: true, category: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!application) {
    return c.json({ error: 'Application not found' }, 404);
  }

  return c.json(application);
});

// Update my application (only if still pending)
app.patch('/mine/:id', requireAuth, requireRole('CANDIDATE'), async (c) => {
  const user = c.get('user') as AuthUser;
  const id = c.req.param('id');
  const body = await c.req.json();

  const parsed = updateApplicationSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400);
  }

  const application = await db.jobApplication.findFirst({
    where: { id, candidateId: user.id },
  });

  if (!application) {
    return c.json({ error: 'Application not found' }, 404);
  }

  if (!canUpdateApplication(application.status)) {
    return c.json({ error: 'Cannot update application after it has been reviewed' }, 400);
  }

  const updated = await db.jobApplication.update({
    where: { id },
    data: parsed.data,
  });

  return c.json(updated);
});

// Withdraw my application
app.delete('/mine/:id', requireAuth, requireRole('CANDIDATE'), async (c) => {
  const user = c.get('user') as AuthUser;
  const id = c.req.param('id');

  const application = await db.jobApplication.findFirst({
    where: { id, candidateId: user.id },
  });

  if (!application) {
    return c.json({ error: 'Application not found' }, 404);
  }

  // Can only withdraw if pending or reviewed (not if shortlisted/hired)
  if (!canWithdrawApplication(application.status)) {
    return c.json({ error: 'Cannot withdraw application at this stage' }, 400);
  }

  await db.jobApplication.delete({ where: { id } });

  return c.json({ success: true });
});

// ─────────────────────────────────────────────────────────────────
// Recruiter routes - manage applications for their jobs
// ─────────────────────────────────────────────────────────────────

// List applications for a job (recruiter)
app.get('/job/:jobId', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const jobId = c.req.param('jobId');
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '20');
  const status = c.req.query('status') as ApplicationStatus | undefined;

  // Verify ownership
  const job = await db.job.findFirst({
    where: { id: jobId, recruiterId: user.id },
  });

  if (!job) {
    return c.json({ error: 'Job not found or unauthorized' }, 404);
  }

  const where = {
    jobId,
    ...(status && { status }),
  };

  const [applications, total] = await Promise.all([
    db.jobApplication.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { appliedAt: 'desc' },
      include: {
        resumeFile: { select: { id: true, name: true } },
      },
    }),
    db.jobApplication.count({ where }),
  ]);

  // Fetch candidate info separately (since candidateId is just a string)
  const candidateIds = applications.map((a) => a.candidateId);
  const candidates = await db.user.findMany({
    where: { id: { in: candidateIds } },
    select: {
      id: true,
      email: true,
      fullName: true,
      avatarUrl: true,
      candidateProfile: {
        select: { bio: true, skills: true, experienceYears: true },
      },
    },
  });

  const candidateMap = new Map(candidates.map((c) => [c.id, c]));

  const enrichedApplications = applications.map((app) => ({
    ...app,
    candidate: candidateMap.get(app.candidateId) || null,
  }));

  return c.json({
    data: enrichedApplications,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// Get single application (recruiter)
app.get('/:id', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const id = c.req.param('id');

  const application = await db.jobApplication.findFirst({
    where: {
      id,
      job: { recruiterId: user.id },
    },
    include: {
      job: { select: { id: true, title: true } },
      resumeFile: { select: { id: true, name: true, mimeType: true, size: true } },
      files: {
        select: { id: true, name: true, mimeType: true, category: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!application) {
    return c.json({ error: 'Application not found or unauthorized' }, 404);
  }

  // Get candidate details
  const candidate = await db.user.findUnique({
    where: { id: application.candidateId },
    select: {
      id: true,
      email: true,
      fullName: true,
      avatarUrl: true,
      candidateProfile: {
        select: {
          bio: true,
          skills: true,
          experienceYears: true,
          linkedinUrl: true,
          portfolioUrl: true,
        },
      },
    },
  });

  return c.json({
    ...application,
    candidate,
  });
});

// Update application status (recruiter)
app.patch('/:id/status', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const id = c.req.param('id');
  const body = await c.req.json();

  const parsed = updateStatusSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400);
  }

  const application = await db.jobApplication.findFirst({
    where: {
      id,
      job: { recruiterId: user.id },
    },
    include: { job: { select: { title: true } } },
  });

  if (!application) {
    return c.json({ error: 'Application not found or unauthorized' }, 404);
  }

  // Validate status transition
  const newStatus = parsed.data.status;
  if (!isValidApplicationTransition(application.status, newStatus)) {
    return c.json({
      error: `Invalid status transition from '${application.status}' to '${newStatus}'`,
      validTransitions: APPLICATION_TRANSITIONS[application.status],
    }, 400);
  }

  const updated = await db.jobApplication.update({
    where: { id },
    data: {
      status: newStatus,
      reviewedAt: new Date(),
    },
  });

  // Notify candidate of status change
  emitTo.user(application.candidateId, 'application:status', {
    applicationId: id,
    jobTitle: application.job.title,
    status: parsed.data.status,
  });

  return c.json(updated);
});

// Add recruiter notes to application
app.patch('/:id/notes', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const id = c.req.param('id');
  const { notes } = await c.req.json() as { notes: string };

  if (typeof notes !== 'string') {
    return c.json({ error: 'Notes must be a string' }, 400);
  }

  const application = await db.jobApplication.findFirst({
    where: {
      id,
      job: { recruiterId: user.id },
    },
  });

  if (!application) {
    return c.json({ error: 'Application not found or unauthorized' }, 404);
  }

  const updated = await db.jobApplication.update({
    where: { id },
    data: { notes },
  });

  return c.json(updated);
});

// ─────────────────────────────────────────────────────────────────
// Admin routes - view all applications
// ─────────────────────────────────────────────────────────────────

app.get('/admin/all', requireAuth, requireRole('ADMIN'), async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '20');
  const status = c.req.query('status') as ApplicationStatus | undefined;
  const jobId = c.req.query('jobId');

  const where = {
    ...(status && { status }),
    ...(jobId && { jobId }),
  };

  const [applications, total] = await Promise.all([
    db.jobApplication.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { appliedAt: 'desc' },
      include: {
        job: {
          select: {
            id: true,
            title: true,
            recruiter: { select: { id: true, fullName: true, email: true } },
          },
        },
        resumeFile: { select: { id: true, name: true } },
      },
    }),
    db.jobApplication.count({ where }),
  ]);

  // Fetch candidate info
  const candidateIds = applications.map((a) => a.candidateId);
  const candidates = await db.user.findMany({
    where: { id: { in: candidateIds } },
    select: { id: true, email: true, fullName: true },
  });
  const candidateMap = new Map(candidates.map((c) => [c.id, c]));

  const enrichedApplications = applications.map((app) => ({
    ...app,
    candidate: candidateMap.get(app.candidateId) || null,
  }));

  return c.json({
    data: enrichedApplications,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

export default app;
