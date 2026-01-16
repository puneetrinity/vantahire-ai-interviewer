import { Hono } from 'hono';
import { z } from 'zod';
import { nanoid } from 'nanoid';

import { db } from '../lib/db.js';
import { config } from '../lib/config.js';
import { requireAuth, requireInterviewToken } from '../middleware/auth.js';
import type { AppEnv, AuthUser } from '../types/index.js';
import { emitTo } from '../lib/socket.js';
import { InterviewType, InterviewStatus } from '@prisma/client';

// Services
import { sendInterviewInvite } from '../services/email/brevo.js';
import { sendInterviewInviteWhatsApp } from '../services/whatsapp/meta.js';
import {
  generateUploadUrl,
  generateDownloadUrl,
  saveRecordingKey,
  getRecordingUrl,
  isGCSConfigured,
} from '../services/storage/gcs.js';
import { evaluateInterview, type InterviewMessage } from '../services/ai/evaluation.js';

const app = new Hono<AppEnv>();

// ─────────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────────

const createInterviewSchema = z.object({
  candidateEmail: z.string().email(),
  candidateName: z.string().optional(),
  candidateNotes: z.string().optional(),
  candidateResumeFileId: z.string().uuid().optional(),
  jobId: z.string().uuid().optional(),
  jobRole: z.string().min(1),
  type: z.nativeEnum(InterviewType).default('TEXT'),
  timeLimitMinutes: z.number().min(5).max(120).default(30),
  expiresAt: z.string().datetime().optional(),
});

const updateInterviewSchema = z.object({
  candidateName: z.string().optional(),
  candidateNotes: z.string().optional(),
  timeLimitMinutes: z.number().min(5).max(120).optional(),
});

// ─────────────────────────────────────────────────────────────────
// Recruiter routes
// ─────────────────────────────────────────────────────────────────

// List interviews
app.get('/', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '20');
  const status = c.req.query('status') as InterviewStatus | undefined;

  const where = {
    recruiterId: user.id,
    ...(status && { status }),
  };

  const [interviews, total] = await Promise.all([
    db.interview.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        job: { select: { id: true, title: true } },
        _count: { select: { messages: true } },
      },
    }),
    db.interview.count({ where }),
  ]);

  return c.json({
    data: interviews,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// Get single interview
app.get('/:id', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const id = c.req.param('id');

  const interview = await db.interview.findFirst({
    where: { id, recruiterId: user.id },
    include: {
      job: true,
      messages: { orderBy: { createdAt: 'asc' } },
      sessions: {
        where: { revokedAt: null },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!interview) {
    return c.json({ error: 'Interview not found' }, 404);
  }

  return c.json(interview);
});

// Default interview expiry (7 days from creation)
const DEFAULT_INTERVIEW_EXPIRY_DAYS = 7;

// Create interview
app.post('/', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const body = await c.req.json();

  const parsed = createInterviewSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400);
  }

  const data = parsed.data;

  // Calculate expiry dates
  const now = new Date();
  const interviewExpiresAt = data.expiresAt
    ? new Date(data.expiresAt)
    : new Date(now.getTime() + DEFAULT_INTERVIEW_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const sessionExpiresAt = new Date(
    now.getTime() + config.INTERVIEW_SESSION_TTL_HOURS * 60 * 60 * 1000
  );

  // Generate token for the initial session
  const token = nanoid(32);

  // Create interview with initial session in a transaction
  const interview = await db.$transaction(async (tx) => {
    // Create the interview
    const newInterview = await tx.interview.create({
      data: {
        recruiterId: user.id,
        candidateEmail: data.candidateEmail,
        candidateName: data.candidateName,
        candidateNotes: data.candidateNotes,
        candidateResumeFileId: data.candidateResumeFileId,
        jobId: data.jobId,
        jobRole: data.jobRole,
        type: data.type,
        timeLimitMinutes: data.timeLimitMinutes,
        expiresAt: interviewExpiresAt,
      },
    });

    // Create the initial session
    await tx.interviewSession.create({
      data: {
        interviewId: newInterview.id,
        token,
        expiresAt: sessionExpiresAt,
      },
    });

    // Generate interview URL and update
    const interviewUrl = `${config.CLIENT_URL}/interview/${newInterview.id}?token=${token}`;
    const updated = await tx.interview.update({
      where: { id: newInterview.id },
      data: { interviewUrl },
      include: {
        sessions: {
          where: { revokedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    return updated;
  });

  return c.json(interview, 201);
});

// Update interview
app.patch('/:id', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const id = c.req.param('id');
  const body = await c.req.json();

  const parsed = updateInterviewSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400);
  }

  const interview = await db.interview.findFirst({
    where: { id, recruiterId: user.id },
  });

  if (!interview) {
    return c.json({ error: 'Interview not found' }, 404);
  }

  if (interview.status !== 'PENDING') {
    return c.json({ error: 'Cannot update interview after it has started' }, 400);
  }

  const updated = await db.interview.update({
    where: { id },
    data: parsed.data,
  });

  return c.json(updated);
});

// Delete interview
app.delete('/:id', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const id = c.req.param('id');

  const interview = await db.interview.findFirst({
    where: { id, recruiterId: user.id },
  });

  if (!interview) {
    return c.json({ error: 'Interview not found' }, 404);
  }

  await db.interview.delete({ where: { id } });

  return c.json({ success: true });
});

// ─────────────────────────────────────────────────────────────────
// Session management (for candidate access)
// ─────────────────────────────────────────────────────────────────

// Create interview session token
app.post('/:id/sessions', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const interviewId = c.req.param('id');

  const interview = await db.interview.findFirst({
    where: { id: interviewId, recruiterId: user.id },
  });

  if (!interview) {
    return c.json({ error: 'Interview not found' }, 404);
  }

  // Generate token
  const token = nanoid(32);
  const expiresAt = new Date(Date.now() + config.INTERVIEW_SESSION_TTL_HOURS * 60 * 60 * 1000);

  const session = await db.interviewSession.create({
    data: {
      interviewId,
      token,
      expiresAt,
    },
  });

  // Generate interview URL
  const interviewUrl = `${config.CLIENT_URL}/interview/${interviewId}?token=${token}`;

  // Update interview with URL
  await db.interview.update({
    where: { id: interviewId },
    data: { interviewUrl },
  });

  return c.json({
    sessionId: session.id,
    token,
    expiresAt: session.expiresAt,
    interviewUrl,
  }, 201);
});

// List sessions for interview
app.get('/:id/sessions', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const interviewId = c.req.param('id');

  const interview = await db.interview.findFirst({
    where: { id: interviewId, recruiterId: user.id },
  });

  if (!interview) {
    return c.json({ error: 'Interview not found' }, 404);
  }

  const sessions = await db.interviewSession.findMany({
    where: { interviewId },
    orderBy: { createdAt: 'desc' },
  });

  return c.json(sessions);
});

// Revoke session
app.delete('/:id/sessions/:sessionId', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const interviewId = c.req.param('id');
  const sessionId = c.req.param('sessionId');

  const interview = await db.interview.findFirst({
    where: { id: interviewId, recruiterId: user.id },
  });

  if (!interview) {
    return c.json({ error: 'Interview not found' }, 404);
  }

  await db.interviewSession.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
  });

  return c.json({ success: true });
});

// ─────────────────────────────────────────────────────────────────
// Candidate routes (token-based)
// ─────────────────────────────────────────────────────────────────

// Get interview as candidate
app.get('/candidate/current', requireInterviewToken, async (c) => {
  const { interview } = c.get('interviewSession') as {
    interview: { id: string; jobRole: string; type: string; timeLimitMinutes: number; status: string; startedAt: Date | null };
  };

  return c.json({
    id: interview.id,
    jobRole: interview.jobRole,
    type: interview.type,
    timeLimitMinutes: interview.timeLimitMinutes,
    status: interview.status,
    startedAt: interview.startedAt,
  });
});

// Start interview as candidate
app.post('/candidate/start', requireInterviewToken, async (c) => {
  const { interviewId, interview } = c.get('interviewSession') as {
    interviewId: string;
    interview: { status: string; recruiterId: string };
  };

  if (interview.status !== 'PENDING') {
    return c.json({ error: 'Interview already started or completed' }, 400);
  }

  const updated = await db.interview.update({
    where: { id: interviewId },
    data: {
      status: 'IN_PROGRESS',
      startedAt: new Date(),
    },
  });

  // Emit real-time update
  emitTo.user(interview.recruiterId, 'interview:status', {
    interviewId,
    status: 'IN_PROGRESS',
  });

  return c.json({
    status: updated.status,
    startedAt: updated.startedAt,
  });
});

// Send message as candidate (text interview)
app.post('/candidate/message', requireInterviewToken, async (c) => {
  const { interviewId, interview } = c.get('interviewSession') as {
    interviewId: string;
    interview: { status: string; type: string; recruiterId: string };
  };

  if (interview.status !== 'IN_PROGRESS') {
    return c.json({ error: 'Interview not in progress' }, 400);
  }

  if (interview.type !== 'TEXT') {
    return c.json({ error: 'This endpoint is for text interviews only' }, 400);
  }

  const { content } = await c.req.json();

  if (!content || typeof content !== 'string') {
    return c.json({ error: 'Content is required' }, 400);
  }

  // Save user message
  await db.interviewMessage.create({
    data: {
      interviewId,
      role: 'user',
      content,
    },
  });

  // TODO: Generate AI response via Groq
  // For now, return placeholder
  const aiResponse = 'Thank you for your response. Let me ask you another question...';

  // Save AI message
  const aiMessage = await db.interviewMessage.create({
    data: {
      interviewId,
      role: 'assistant',
      content: aiResponse,
    },
  });

  // Emit real-time update
  emitTo.interview(interviewId, 'interview:message', {
    interviewId,
    message: { role: 'assistant', content: aiResponse },
  });

  return c.json({
    userMessage: { role: 'user', content },
    aiMessage: { role: 'assistant', content: aiResponse },
  });
});

// Complete interview as candidate
app.post('/candidate/complete', requireInterviewToken, async (c) => {
  const { interviewId, interview } = c.get('interviewSession') as {
    interviewId: string;
    interview: { status: string; recruiterId: string; jobRole: string };
  };

  if (interview.status !== 'IN_PROGRESS') {
    return c.json({ error: 'Interview not in progress' }, 400);
  }

  // Mark as completed first
  let updated = await db.interview.update({
    where: { id: interviewId },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
    },
  });

  // Emit initial completion
  emitTo.user(interview.recruiterId, 'interview:status', {
    interviewId,
    status: 'COMPLETED',
  });

  // Generate AI evaluation asynchronously (don't block response)
  (async () => {
    try {
      // Fetch interview messages
      const messages = await db.interviewMessage.findMany({
        where: { interviewId },
        orderBy: { createdAt: 'asc' },
        select: { role: true, content: true },
      });

      if (messages.length < 2) {
        console.log(`Interview ${interviewId}: Not enough messages for evaluation`);
        return;
      }

      // Run AI evaluation
      const evaluation = await evaluateInterview(
        messages as InterviewMessage[],
        interview.jobRole
      );

      // Update interview with evaluation results
      await db.interview.update({
        where: { id: interviewId },
        data: {
          score: evaluation.score,
          transcriptSummary: JSON.stringify({
            summary: evaluation.summary,
            strengths: evaluation.strengths,
            improvements: evaluation.improvements,
            recommendation: evaluation.recommendation,
            technicalScore: evaluation.technicalScore,
            communicationScore: evaluation.communicationScore,
            problemSolvingScore: evaluation.problemSolvingScore,
          }),
        },
      });

      // Emit score update
      emitTo.user(interview.recruiterId, 'interview:scored', {
        interviewId,
        score: evaluation.score,
        recommendation: evaluation.recommendation,
      });

      console.log(`Interview ${interviewId}: Evaluation complete, score ${evaluation.score}`);
    } catch (error) {
      console.error(`Interview ${interviewId}: Evaluation failed`, error);
    }
  })();

  return c.json({
    status: updated.status,
    completedAt: updated.completedAt,
    message: 'Interview completed. Evaluation in progress.',
  });
});

// Get messages as candidate
app.get('/candidate/messages', requireInterviewToken, async (c) => {
  const { interviewId } = c.get('interviewSession') as { interviewId: string };

  const messages = await db.interviewMessage.findMany({
    where: { interviewId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      role: true,
      content: true,
      createdAt: true,
    },
  });

  return c.json(messages);
});

// ─────────────────────────────────────────────────────────────────
// Notification routes (email/WhatsApp invites)
// ─────────────────────────────────────────────────────────────────

// Send email invitation
app.post('/:id/invite/email', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const id = c.req.param('id');

  const interview = await db.interview.findFirst({
    where: { id, recruiterId: user.id },
    select: { id: true, interviewUrl: true },
  });

  if (!interview) {
    return c.json({ error: 'Interview not found' }, 404);
  }

  if (!interview.interviewUrl) {
    return c.json({ error: 'Interview URL not generated yet' }, 400);
  }

  const result = await sendInterviewInvite(id, interview.interviewUrl);

  if (!result.success) {
    return c.json({ error: result.error || 'Failed to send email' }, 500);
  }

  return c.json({
    success: true,
    messageId: result.messageId,
    emailMessageId: result.emailMessageId,
  });
});

// Send WhatsApp invitation
app.post('/:id/invite/whatsapp', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const id = c.req.param('id');

  const { phone } = await c.req.json() as { phone?: string };

  if (!phone) {
    return c.json({ error: 'Phone number is required' }, 400);
  }

  const interview = await db.interview.findFirst({
    where: { id, recruiterId: user.id },
    select: { id: true, interviewUrl: true },
  });

  if (!interview) {
    return c.json({ error: 'Interview not found' }, 404);
  }

  if (!interview.interviewUrl) {
    return c.json({ error: 'Interview URL not generated yet' }, 400);
  }

  const result = await sendInterviewInviteWhatsApp(id, phone, interview.interviewUrl);

  if (!result.success) {
    return c.json({ error: result.error || 'Failed to send WhatsApp message' }, 500);
  }

  return c.json({
    success: true,
    messageId: result.messageId,
    whatsappMessageId: result.whatsappMessageId,
  });
});

// ─────────────────────────────────────────────────────────────────
// Recording routes (GCS video storage)
// ─────────────────────────────────────────────────────────────────

// Get recording upload URL (for voice interview client)
app.post('/:id/recording/upload-url', requireInterviewToken, async (c) => {
  const { interviewId, interview } = c.get('interviewSession') as {
    interviewId: string;
    interview: { type: string };
  };

  if (interview.type !== 'VOICE') {
    return c.json({ error: 'Recording only supported for voice interviews' }, 400);
  }

  if (!isGCSConfigured()) {
    return c.json({ error: 'Recording storage not configured' }, 503);
  }

  try {
    const contentType = ((await c.req.json()) as { contentType?: string }).contentType || 'video/webm';
    const { uploadUrl, gcsKey } = await generateUploadUrl(interviewId, contentType);

    return c.json({ uploadUrl, gcsKey });
  } catch (error) {
    console.error('Failed to generate upload URL:', error);
    return c.json({ error: 'Failed to generate upload URL' }, 500);
  }
});

// Save recording key after upload (for voice interview client)
app.post('/:id/recording/complete', requireInterviewToken, async (c) => {
  const { interviewId } = c.get('interviewSession') as { interviewId: string };

  const { gcsKey } = await c.req.json() as { gcsKey?: string };

  if (!gcsKey) {
    return c.json({ error: 'gcsKey is required' }, 400);
  }

  try {
    await saveRecordingKey(interviewId, gcsKey);
    return c.json({ success: true });
  } catch (error) {
    console.error('Failed to save recording key:', error);
    return c.json({ error: 'Failed to save recording' }, 500);
  }
});

// Get recording download URL (for recruiter)
app.get('/:id/recording', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const id = c.req.param('id');

  const interview = await db.interview.findFirst({
    where: { id, recruiterId: user.id },
    select: { recordingGcsKey: true },
  });

  if (!interview) {
    return c.json({ error: 'Interview not found' }, 404);
  }

  if (!interview.recordingGcsKey) {
    return c.json({ error: 'No recording available' }, 404);
  }

  try {
    const downloadUrl = await generateDownloadUrl(interview.recordingGcsKey);
    return c.json({ downloadUrl });
  } catch (error) {
    console.error('Failed to generate download URL:', error);
    return c.json({ error: 'Failed to generate download URL' }, 500);
  }
});

export default app;
