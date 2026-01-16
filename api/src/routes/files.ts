import { Hono } from 'hono';
import { z } from 'zod';
import { stream } from 'hono/streaming';

import { db } from '../lib/db.js';
import { config } from '../lib/config.js';
import {
  requireAuth,
  optionalAuth,
  optionalInterviewToken,
  INTERVIEW_TOKEN_HEADER,
} from '../middleware/auth.js';
import type { AppEnv, AuthUser } from '../types/index.js';
import { FileCategory, InterviewStatus } from '@prisma/client';
import {
  FilePurpose,
  type FilePurposeType,
  VALID_PURPOSES,
  ALLOWED_MIMES,
  isValidPurposeForCategory,
  isValidMimeType,
  canCandidateUploadPurpose,
  canUploadToInterview,
  requiresInterviewId,
  requiresApplicationId,
  isPublicCategory,
} from '../lib/rules/file-rules.js';

const app = new Hono<AppEnv>();

const MAX_FILE_SIZE = config.MAX_FILE_SIZE_MB * 1024 * 1024;
const STREAM_CHUNK_SIZE = 64 * 1024; // 64KB chunks

// Upload schema
const uploadSchema = z.object({
  category: z.nativeEnum(FileCategory),
  purpose: z.enum([
    'recruiter_logo',
    'profile_resume',
    'interview_resume',
    'application_resume',
    'interview_attachment',
    'application_attachment',
  ]),
  interviewId: z.string().uuid().optional(),
  jobApplicationId: z.string().uuid().optional(),
});

// ─────────────────────────────────────────────────────────────────
// GET /files/:id - Stream file with auth rules
// ─────────────────────────────────────────────────────────────────

// Combined middleware: check both session auth and interview token
app.get('/:id', optionalAuth, optionalInterviewToken, async (c) => {
  const fileId = c.req.param('id');
  const user = c.get('user') as AuthUser | undefined;
  const interviewSession = c.get('interviewSession') as {
    interviewId: string;
    interview: { recruiterId: string };
  } | undefined;

  // Fetch file metadata with relations (without data for auth check)
  const file = await db.file.findUnique({
    where: { id: fileId },
    select: {
      id: true,
      name: true,
      mimeType: true,
      size: true,
      category: true,
      uploadedBy: true,
      interviewId: true,
      jobApplicationId: true,
      // Check related entities for ownership
      interview: { select: { recruiterId: true } },
      jobApplication: { select: { candidateId: true, job: { select: { recruiterId: true } } } },
      recruiterLogoFor: { select: { userId: true } },
      candidateResumeFor: { select: { userId: true } },
      interviewResumeFor: { select: { recruiterId: true } },
      applicationResumeFor: { select: { candidateId: true, job: { select: { recruiterId: true } } } },
    },
  });

  if (!file) {
    return c.json({ error: 'File not found' }, 404);
  }

  // ─────────────────────────────────────────────────────────────
  // Authorization rules based on file category and relations
  // ─────────────────────────────────────────────────────────────

  let authorized = false;

  // Public files (company logos shown on interview pages)
  if (isPublicCategory(file.category)) {
    authorized = true;
  }
  // RESUME files - multiple access paths
  else if (file.category === 'RESUME') {
    // 1. Owner uploaded it
    if (user && file.uploadedBy === user.id) {
      authorized = true;
    }
    // 2. It's the candidate's own resume (CandidateProfile)
    else if (user && file.candidateResumeFor?.userId === user.id) {
      authorized = true;
    }
    // 3. Recruiter who owns the interview it's attached to
    else if (user && file.interviewResumeFor?.recruiterId === user.id) {
      authorized = true;
    }
    else if (user && file.interview?.recruiterId === user.id) {
      authorized = true;
    }
    // 4. Recruiter who owns the job application it's attached to
    else if (user && file.applicationResumeFor?.job?.recruiterId === user.id) {
      authorized = true;
    }
    else if (user && file.jobApplication?.job?.recruiterId === user.id) {
      authorized = true;
    }
    // 5. Candidate who owns the application it's attached to
    else if (user && file.applicationResumeFor?.candidateId === user.id) {
      authorized = true;
    }
    else if (user && file.jobApplication?.candidateId === user.id) {
      authorized = true;
    }
    // 6. Candidate with valid interview token for this interview
    else if (interviewSession && file.interviewId === interviewSession.interviewId) {
      authorized = true;
    }
    // 7. Admin
    else if (user?.role === 'ADMIN') {
      authorized = true;
    }
  }
  // SCREENSHOT files - interview or application context
  else if (file.category === 'SCREENSHOT') {
    // 1. Owner uploaded it
    if (user && file.uploadedBy === user.id) {
      authorized = true;
    }
    // 2. Recruiter who owns the interview or application
    else if (user && file.interview?.recruiterId === user.id) {
      authorized = true;
    }
    else if (user && file.jobApplication?.job?.recruiterId === user.id) {
      authorized = true;
    }
    // 3. Candidate who owns the application
    else if (user && file.jobApplication?.candidateId === user.id) {
      authorized = true;
    }
    // 4. Candidate with valid interview token for this interview
    else if (interviewSession && file.interviewId === interviewSession.interviewId) {
      authorized = true;
    }
    // 5. Admin
    else if (user?.role === 'ADMIN') {
      authorized = true;
    }
  }
  // DOCUMENT files - similar to screenshot
  else if (file.category === 'DOCUMENT') {
    // 1. Owner uploaded it
    if (user && file.uploadedBy === user.id) {
      authorized = true;
    }
    // 2. Recruiter who owns the interview/application
    else if (user && file.interview?.recruiterId === user.id) {
      authorized = true;
    }
    else if (user && file.jobApplication?.job?.recruiterId === user.id) {
      authorized = true;
    }
    // 3. Candidate who owns the application
    else if (user && file.jobApplication?.candidateId === user.id) {
      authorized = true;
    }
    // 4. Candidate with valid interview token
    else if (interviewSession && file.interviewId === interviewSession.interviewId) {
      authorized = true;
    }
    // 5. Admin
    else if (user?.role === 'ADMIN') {
      authorized = true;
    }
  }

  if (!authorized) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  // ─────────────────────────────────────────────────────────────
  // Stream the file data using raw query to avoid loading into memory
  // ─────────────────────────────────────────────────────────────

  // Set headers
  c.header('Content-Type', file.mimeType);
  c.header('Content-Length', file.size.toString());
  c.header('Content-Disposition', `inline; filename="${encodeURIComponent(file.name)}"`);

  // LOGO files are public - allow caching
  if (file.category === 'LOGO') {
    c.header('Cache-Control', 'public, max-age=86400'); // 24 hours
  } else {
    c.header('Cache-Control', 'private, max-age=3600'); // 1 hour
  }

  // Stream file in chunks using raw SQL to avoid loading entire blob
  return stream(c, async (s) => {
    // For PostgreSQL, we use lo_* functions or read in chunks via substring
    // Since Prisma doesn't support streaming, we chunk read the BYTEA
    const chunkSize = STREAM_CHUNK_SIZE;
    let offset = 0;

    while (offset < file.size) {
      const result = await db.$queryRaw<{ chunk: Buffer }[]>`
        SELECT substring(data FROM ${offset + 1} FOR ${chunkSize}) as chunk
        FROM "File"
        WHERE id = ${fileId}
      `;

      if (result.length === 0 || !result[0].chunk) break;

      const chunk = result[0].chunk;
      await s.write(new Uint8Array(chunk));
      offset += chunk.length;

      if (chunk.length < chunkSize) break;
    }
  });
});

// ─────────────────────────────────────────────────────────────────
// POST /files - Upload a file (supports both session auth and interview token)
// ─────────────────────────────────────────────────────────────────

app.post('/', optionalAuth, optionalInterviewToken, async (c) => {
  const user = c.get('user') as AuthUser | undefined;
  const interviewSession = c.get('interviewSession') as {
    interviewId: string;
    interview: { id: string; recruiterId: string; status: string };
  } | undefined;

  // Must have either user session or interview token
  if (!user && !interviewSession) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;
  const categoryStr = formData.get('category') as string | null;
  const purposeStr = formData.get('purpose') as string | null;
  const interviewIdParam = formData.get('interviewId') as string | null;
  const jobApplicationIdParam = formData.get('jobApplicationId') as string | null;

  if (!file) {
    return c.json({ error: 'No file provided' }, 400);
  }

  // Validate params
  const parseResult = uploadSchema.safeParse({
    category: categoryStr,
    purpose: purposeStr,
    interviewId: interviewIdParam || undefined,
    jobApplicationId: jobApplicationIdParam || undefined,
  });

  if (!parseResult.success) {
    return c.json({ error: 'Invalid parameters', details: parseResult.error.flatten() }, 400);
  }

  const { category, purpose, interviewId, jobApplicationId } = parseResult.data;

  // Validate purpose matches category
  if (!isValidPurposeForCategory(category, purpose as FilePurposeType)) {
    return c.json({
      error: `Invalid purpose '${purpose}' for category '${category}'. Valid: ${VALID_PURPOSES[category].join(', ')}`,
    }, 400);
  }

  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return c.json(
      { error: `File too large. Maximum size is ${config.MAX_FILE_SIZE_MB}MB` },
      400
    );
  }

  // Validate mime type
  if (!isValidMimeType(category, file.type)) {
    return c.json(
      { error: `Invalid file type for ${category}. Allowed: ${ALLOWED_MIMES[category].join(', ')}` },
      400
    );
  }

  // ─────────────────────────────────────────────────────────────
  // Authorization and context validation based on purpose
  // ─────────────────────────────────────────────────────────────

  let resolvedInterviewId: string | undefined;
  let resolvedJobApplicationId: string | undefined;

  // Candidate with interview token (no user session)
  if (interviewSession && !user) {
    if (!canCandidateUploadPurpose(purpose as FilePurposeType)) {
      return c.json({ error: `Candidates can only upload with purpose 'interview_resume' or 'interview_attachment'` }, 403);
    }

    if (!canUploadToInterview(interviewSession.interview.status as InterviewStatus)) {
      return c.json({ error: 'Interview is no longer active' }, 400);
    }

    resolvedInterviewId = interviewSession.interviewId;
  }
  // Authenticated user
  else if (user) {
    // Validate context requirements based on purpose
    if (requiresInterviewId(purpose as FilePurposeType) && !interviewId) {
      return c.json({ error: `Purpose '${purpose}' requires interviewId` }, 400);
    }

    if (requiresApplicationId(purpose as FilePurposeType) && !jobApplicationId) {
      return c.json({ error: `Purpose '${purpose}' requires jobApplicationId` }, 400);
    }

    switch (purpose) {
      case 'recruiter_logo':
        // No additional context needed - will wire to user's RecruiterProfile
        break;

      case 'profile_resume':
        // No additional context needed - will wire to user's CandidateProfile
        break;

      case 'interview_resume':
      case 'interview_attachment':
        // Must own the interview
        const interview = await db.interview.findFirst({
          where: { id: interviewId, recruiterId: user.id },
        });
        if (!interview) {
          return c.json({ error: 'Interview not found or unauthorized' }, 403);
        }
        resolvedInterviewId = interviewId;
        break;

      case 'application_resume':
      case 'application_attachment':
        // Must be the candidate OR the recruiter who owns the job
        const application = await db.jobApplication.findFirst({
          where: {
            id: jobApplicationId,
            OR: [
              { candidateId: user.id },                    // Candidate owns the application
              { job: { recruiterId: user.id } },          // Recruiter owns the job
            ],
          },
        });
        if (!application) {
          return c.json({ error: 'Job application not found or unauthorized' }, 403);
        }
        resolvedJobApplicationId = jobApplicationId;
        break;
    }
  }

  // Read file data
  const arrayBuffer = await file.arrayBuffer();
  const data = Buffer.from(arrayBuffer);

  // Save file and wire owning model in a transaction
  const savedFile = await db.$transaction(async (tx) => {
    // Create the file
    const newFile = await tx.file.create({
      data: {
        name: file.name,
        mimeType: file.type,
        size: file.size,
        category,
        uploadedBy: user?.id || null,
        interviewId: resolvedInterviewId,
        jobApplicationId: resolvedJobApplicationId,
        data,
      },
    });

    // Wire the owning model based on purpose
    switch (purpose) {
      case 'recruiter_logo':
        await tx.recruiterProfile.upsert({
          where: { userId: user!.id },
          create: { userId: user!.id, logoFileId: newFile.id },
          update: { logoFileId: newFile.id },
        });
        break;

      case 'profile_resume':
        await tx.candidateProfile.upsert({
          where: { userId: user!.id },
          create: { userId: user!.id, resumeFileId: newFile.id },
          update: { resumeFileId: newFile.id },
        });
        break;

      case 'interview_resume':
        await tx.interview.update({
          where: { id: resolvedInterviewId! },
          data: { candidateResumeFileId: newFile.id },
        });
        break;

      case 'application_resume':
        await tx.jobApplication.update({
          where: { id: resolvedJobApplicationId! },
          data: { resumeFileId: newFile.id },
        });
        break;

      // interview_attachment and application_attachment don't wire to specific fields
      // They only set File.interviewId or File.jobApplicationId (already done above)
    }

    return newFile;
  });

  return c.json({
    id: savedFile.id,
    name: savedFile.name,
    mimeType: savedFile.mimeType,
    size: savedFile.size,
    category: savedFile.category,
    purpose,
    url: `${config.API_URL}/files/${savedFile.id}`,
  }, 201);
});

// ─────────────────────────────────────────────────────────────────
// DELETE /files/:id - Delete a file
// ─────────────────────────────────────────────────────────────────

app.delete('/:id', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const fileId = c.req.param('id');

  const file = await db.file.findUnique({
    where: { id: fileId },
    select: { id: true, uploadedBy: true },
  });

  if (!file) {
    return c.json({ error: 'File not found' }, 404);
  }

  // Only owner or admin can delete
  if (file.uploadedBy !== user.id && user.role !== 'ADMIN') {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  await db.file.delete({ where: { id: fileId } });

  return c.json({ success: true });
});

export default app;
