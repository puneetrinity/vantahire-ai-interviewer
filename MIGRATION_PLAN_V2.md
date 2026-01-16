# VantaHire Migration Plan v2.2
## Greenfield Backend + OAuth-Only + DIY Voice

**Last Updated:** Added OAuth cutover + data migration steps.

---

## Confirmed Decisions

| Decision | Choice | Notes |
|----------|--------|-------|
| Repo layout | **Sibling** (`api/` at root) | No monorepo, minimal changes |
| Session storage | **Redis-only** | No Prisma Session model |
| File serving | **`/files/:id`** with streaming | Ownership checks, no memory loading |
| Candidate access | **Token-based** InterviewSession | TTL + revoke behavior defined |
| Realtime | **Socket.io** with explicit emits | Emit on DB update in routes |
| Voice WS | **@hono/node-ws** | Node runtime on Railway |
| Cartesia client | **ws** package | Node WS client, not browser |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         RAILWAY                                   │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────┐     ┌─────────────────────────────────────┐     │
│  │  Frontend   │     │        Backend (Hono)                │     │
│  │   (Vite)    │────▶│  ├─ OAuth (Google/LinkedIn)         │     │
│  │   :5173     │ WS  │  ├─ REST API                        │     │
│  └─────────────┘     │  ├─ Socket.io (realtime)            │     │
│                      │  ├─ Voice Pipeline (WS)             │     │
│                      │  └─ Cron Jobs (node-cron)           │     │
│                      └──────────────┬──────────────────────┘     │
│                                     │                             │
│                      ┌──────────────┼──────────────┐             │
│                      ▼              ▼              ▼             │
│               ┌───────────┐  ┌───────────┐  ┌───────────┐       │
│               │ PostgreSQL│  │   Redis   │  │  Prisma   │       │
│               │  + Files  │  │ (sessions │  │   (ORM)   │       │
│               │  (BYTEA)  │  │   only)   │  │           │       │
│               └───────────┘  └───────────┘  └───────────┘       │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
   │   Google    │    │    Voice    │    │  External   │
   │   Cloud     │    │   Stack     │    │    APIs     │
   │  Storage    │    │             │    │             │
   │  (videos)   │    │ Deepgram    │    │ Brevo       │
   └─────────────┘    │ Groq        │    │ WhatsApp    │
                      │ Cartesia    │    └─────────────┘
                      └─────────────┘
```

---

## Project Structure (Sibling Layout)

```
vantahire/
├── src/                      # EXISTING Vite frontend (unchanged)
│   ├── pages/
│   ├── components/
│   ├── hooks/
│   └── ...
│
├── api/                      # NEW Hono backend
│   ├── src/
│   │   ├── index.ts          # Entry point + server
│   │   ├── app.ts            # Hono app + routes
│   │   │
│   │   ├── routes/
│   │   │   ├── auth.ts       # OAuth (Google/LinkedIn)
│   │   │   ├── users.ts      # User/profile CRUD
│   │   │   ├── interviews.ts # Interview CRUD
│   │   │   ├── jobs.ts       # Job CRUD
│   │   │   ├── applications.ts
│   │   │   ├── files.ts      # File upload/serve (PG streaming)
│   │   │   ├── videos.ts     # Video upload/serve (GCS)
│   │   │   ├── voice.ts      # Voice interview WS
│   │   │   ├── invites.ts    # Email/WhatsApp sends
│   │   │   ├── webhooks.ts   # Brevo/WhatsApp callbacks
│   │   │   ├── api-keys.ts   # API key management
│   │   │   └── admin.ts      # Admin routes
│   │   │
│   │   ├── middleware/
│   │   │   ├── auth.ts       # OAuth session (Redis)
│   │   │   ├── interview-session.ts  # Token-based access
│   │   │   ├── api-key.ts    # API key validation
│   │   │   └── error.ts      # Error handling
│   │   │
│   │   ├── services/
│   │   │   ├── voice/
│   │   │   │   ├── pipeline.ts
│   │   │   │   ├── stt.ts    # Deepgram
│   │   │   │   ├── tts.ts    # Deepgram/Cartesia
│   │   │   │   └── llm.ts    # Groq
│   │   │   ├── email.ts      # Brevo
│   │   │   ├── whatsapp.ts
│   │   │   ├── storage.ts    # GCS
│   │   │   └── ai.ts         # Summary/recommendation
│   │   │
│   │   ├── lib/
│   │   │   ├── db.ts         # Prisma client
│   │   │   ├── redis.ts      # Redis client
│   │   │   ├── socket.ts     # Socket.io
│   │   │   ├── oauth.ts      # OAuth providers
│   │   │   └── config.ts     # Env config
│   │   │
│   │   └── jobs/
│   │       ├── scheduler.ts  # node-cron setup
│   │       ├── expire-interviews.ts
│   │       └── onboarding-reminders.ts
│   │
│   ├── prisma/
│   │   └── schema.prisma
│   │
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
│
├── package.json              # Frontend deps (unchanged)
├── vite.config.ts
├── docker-compose.yml
├── docker-compose.prod.yml
└── railway.toml
```

---

## Database Schema (Prisma)

**Note:** No `Session` model - sessions are Redis-only.

```prisma
// api/prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ═══════════════════════════════════════════════════════════════
// AUTH & USERS (No Session model - Redis only)
// ═══════════════════════════════════════════════════════════════

model User {
  id            String    @id @default(uuid())
  email         String    @unique
  role          UserRole  @default(RECRUITER)

  // OAuth
  provider      String    // "google" | "linkedin"
  providerId    String

  // Basic info
  fullName      String?
  avatarUrl     String?

  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  // Relations
  recruiterProfile  RecruiterProfile?
  candidateProfile  CandidateProfile?
  interviews        Interview[]
  jobs              Job[]
  apiKeys           ApiKey[]
  files             File[]

  @@unique([provider, providerId])
  @@index([email])
}

enum UserRole {
  RECRUITER
  CANDIDATE
  ADMIN
}

model RecruiterProfile {
  id              String   @id @default(uuid())
  userId          String   @unique
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  companyName     String?
  logoFileId      String?  // FK to File
  logoFile        File?    @relation(fields: [logoFileId], references: [id])
  brandColor      String?

  emailIntro      String?
  emailTips       String?
  emailCtaText    String?

  subscriptionStatus SubscriptionStatus @default(FREE)
  subscriptionUpdatedAt DateTime?

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

enum SubscriptionStatus {
  FREE
  PAID
  ENTERPRISE
}

model CandidateProfile {
  id              String   @id @default(uuid())
  userId          String   @unique
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  fullName        String?
  email           String?
  phone           String?
  bio             String?
  skills          String[] @default([])
  experienceYears Int?
  resumeFileId    String?  // FK to File
  resumeFile      File?    @relation(fields: [resumeFileId], references: [id])
  linkedinUrl     String?
  portfolioUrl    String?

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

// ═══════════════════════════════════════════════════════════════
// INTERVIEWS
// ═══════════════════════════════════════════════════════════════

model Interview {
  id              String          @id @default(uuid())
  recruiterId     String
  recruiter       User            @relation(fields: [recruiterId], references: [id])

  jobId           String?
  job             Job?            @relation(fields: [jobId], references: [id])

  candidateEmail  String
  candidateName   String?
  candidateNotes  String?
  candidateResumeFileId String?   // FK to File
  candidateResumeFile   File?     @relation(fields: [candidateResumeFileId], references: [id])
  candidateUserId String?

  jobRole         String
  type            InterviewType   @default(TEXT)
  timeLimitMinutes Int            @default(30)

  status          InterviewStatus @default(PENDING)
  interviewUrl    String?
  expiresAt       DateTime?
  startedAt       DateTime?
  completedAt     DateTime?

  score           Int?
  transcriptSummary String?
  recordingGcsKey String?         // GCS object key (not URL)

  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  messages        InterviewMessage[]
  sessions        InterviewSession[]
  emailMessages   EmailMessage[]
  whatsappMessages WhatsAppMessage[]

  @@index([recruiterId])
  @@index([status])
  @@index([candidateEmail])
}

enum InterviewType {
  TEXT
  VOICE
}

enum InterviewStatus {
  PENDING
  IN_PROGRESS
  COMPLETED
  EXPIRED
}

model InterviewMessage {
  id          String    @id @default(uuid())
  interviewId String
  interview   Interview @relation(fields: [interviewId], references: [id], onDelete: Cascade)

  role        String    // "user" | "assistant" | "system"
  content     String

  createdAt   DateTime  @default(now())

  @@index([interviewId])
}

// ═══════════════════════════════════════════════════════════════
// INTERVIEW SESSION (Token-based candidate access)
// ═══════════════════════════════════════════════════════════════

model InterviewSession {
  id          String    @id @default(uuid())
  interviewId String
  interview   Interview @relation(fields: [interviewId], references: [id], onDelete: Cascade)

  token       String    @unique   // nanoid(32)

  // TTL + Revocation
  expiresAt   DateTime            // Default: interview.expiresAt or 7 days
  revokedAt   DateTime?           // Set when manually revoked

  // Tracking
  lastAccessedAt DateTime?
  accessCount    Int      @default(0)

  createdAt   DateTime  @default(now())

  @@index([token])
  @@index([interviewId])
  @@index([expiresAt])
}

// ═══════════════════════════════════════════════════════════════
// JOBS
// ═══════════════════════════════════════════════════════════════

model Job {
  id              String         @id @default(uuid())
  recruiterId     String
  recruiter       User           @relation(fields: [recruiterId], references: [id])

  title           String
  description     String?
  department      String?
  location        String?
  jobType         String?
  salaryRange     String?

  status          JobStatus      @default(DRAFT)
  approvalStatus  ApprovalStatus @default(PENDING)
  approvedAt      DateTime?
  approvedBy      String?
  rejectionReason String?

  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  interviews      Interview[]
  applications    JobApplication[]

  @@index([recruiterId])
  @@index([status])
  @@index([approvalStatus])
}

enum JobStatus {
  DRAFT
  ACTIVE
  CLOSED
}

enum ApprovalStatus {
  PENDING
  APPROVED
  REJECTED
}

model JobApplication {
  id            String            @id @default(uuid())
  jobId         String
  job           Job               @relation(fields: [jobId], references: [id])

  candidateId   String
  coverLetter   String?
  resumeFileId  String?           // FK to File
  resumeFile    File?             @relation(fields: [resumeFileId], references: [id])
  notes         String?

  status        ApplicationStatus @default(PENDING)
  reviewedAt    DateTime?

  appliedAt     DateTime          @default(now())
  updatedAt     DateTime          @updatedAt

  @@index([jobId])
  @@index([candidateId])
  @@index([status])
}

enum ApplicationStatus {
  PENDING
  REVIEWED
  SHORTLISTED
  REJECTED
  HIRED
}

// ═══════════════════════════════════════════════════════════════
// MESSAGING
// ═══════════════════════════════════════════════════════════════

model EmailMessage {
  id            String    @id @default(uuid())
  interviewId   String
  interview     Interview @relation(fields: [interviewId], references: [id])

  recipientEmail String
  messageId     String?   @unique

  status        String    @default("pending")
  sentAt        DateTime?
  deliveredAt   DateTime?
  openedAt      DateTime?
  bouncedAt     DateTime?
  failedAt      DateTime?
  errorMessage  String?

  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@index([interviewId])
  @@index([messageId])
}

model WhatsAppMessage {
  id            String    @id @default(uuid())
  interviewId   String
  interview     Interview @relation(fields: [interviewId], references: [id])

  candidatePhone String
  messageId     String?   @unique

  status        String    @default("pending")
  sentAt        DateTime?
  deliveredAt   DateTime?
  readAt        DateTime?
  failedAt      DateTime?
  errorMessage  String?

  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@index([interviewId])
  @@index([messageId])
}

// ═══════════════════════════════════════════════════════════════
// FILES (Stored in Postgres - streamed, not loaded to memory)
// ═══════════════════════════════════════════════════════════════

model File {
  id          String       @id @default(uuid())

  // Metadata
  name        String
  mimeType    String
  size        Int          // bytes
  category    FileCategory

  // Ownership (for auth checks)
  uploadedBy  String?      // User ID
  user        User?        @relation(fields: [uploadedBy], references: [id])

  // Optional associations for access control
  interviewId     String?
  interview       Interview?      @relation(fields: [interviewId], references: [id])
  jobApplicationId String?
  jobApplication  JobApplication? @relation(fields: [jobApplicationId], references: [id])

  // Content
  data        Bytes        // BYTEA

  createdAt   DateTime     @default(now())

  @@index([category])
  @@index([uploadedBy])
  @@index([interviewId])
  @@index([jobApplicationId])
}

enum FileCategory {
  LOGO
  RESUME
  SCREENSHOT
  DOCUMENT
}

// ═══════════════════════════════════════════════════════════════
// API KEYS
// ═══════════════════════════════════════════════════════════════

model ApiKey {
  id              String       @id @default(uuid())
  userId          String
  user            User         @relation(fields: [userId], references: [id])

  name            String
  keyHash         String       @unique
  keyPrefix       String

  scopes          String[]     @default([])
  status          ApiKeyStatus @default(ACTIVE)
  expiresAt       DateTime?
  revokedAt       DateTime?

  rateLimitPerDay Int          @default(1000)
  requestsToday   Int          @default(0)
  lastResetAt     DateTime?
  lastRequestAt   DateTime?

  createdAt       DateTime     @default(now())

  usageLogs       ApiUsageLog[]

  @@index([userId])
  @@index([keyHash])
}

enum ApiKeyStatus {
  ACTIVE
  REVOKED
  EXPIRED
}

model ApiUsageLog {
  id            String   @id @default(uuid())
  apiKeyId      String
  apiKey        ApiKey   @relation(fields: [apiKeyId], references: [id])

  endpoint      String
  method        String
  statusCode    Int?
  responseTimeMs Int?
  ipAddress     String?

  createdAt     DateTime @default(now())

  @@index([apiKeyId])
  @@index([createdAt])
}

// ═══════════════════════════════════════════════════════════════
// ADMIN
// ═══════════════════════════════════════════════════════════════

model AdminSettings {
  id              String   @id @default(uuid())
  secretSignupCode String?

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

model OnboardingReminder {
  id            String   @id @default(uuid())
  userId        String
  reminderType  String
  tasksPending  String[]

  sentAt        DateTime @default(now())

  @@index([userId])
}
```

---

## Contract: `/files/:id` Endpoint

### Upload: `POST /files`

```
Request:
  Content-Type: multipart/form-data
  Authorization: Bearer <session_cookie> OR X-Interview-Token: <token>

  Body:
    file: <binary>
    category: "LOGO" | "RESUME" | "SCREENSHOT" | "DOCUMENT"
    interviewId: <uuid> (optional, recruiter/admin uploads)
    jobApplicationId: <uuid> (optional, recruiter/admin uploads)

Response (201):
  {
    "id": "uuid",
    "name": "logo.png",
    "mimeType": "image/png",
    "size": 12345,
    "category": "LOGO"
  }

Auth Rules:
  - LOGO: Only RECRUITER/ADMIN can upload
  - RESUME: RECRUITER, CANDIDATE, or InterviewSession token
    - If recruiter/admin: must include interviewId or jobApplicationId
    - If InterviewSession token: interviewId is derived from token
  - SCREENSHOT: InterviewSession token only (interviewId from token)
  - DOCUMENT: RECRUITER, CANDIDATE, or InterviewSession token
    - If recruiter/admin: must include interviewId

Size Limits:
  - LOGO: 2 MB
  - RESUME: 10 MB
  - SCREENSHOT: 5 MB
  - DOCUMENT: 10 MB
```

### Download: `GET /files/:id`

```
Request:
  Authorization: Bearer <session_cookie> (optional for public files)
  X-Interview-Token: <token> (for interview-related files)

Response (200):
  Content-Type: <file.mimeType>
  Content-Length: <file.size>
  Cache-Control: public, max-age=31536000, immutable
  ETag: "<file.id>"

  Body: <streamed binary>

Auth Rules:
  - LOGO: Public (no auth required) - company branding
  - RESUME:
    - Owner (uploadedBy), or
    - InterviewSession token that matches file.interviewId, or
    - Recruiter/admin for file.interviewId or file.jobApplicationId
  - SCREENSHOT:
    - InterviewSession token that matches file.interviewId, or
    - Recruiter/admin for file.interviewId
  - DOCUMENT:
    - Owner (uploadedBy), or
    - InterviewSession token that matches file.interviewId, or
    - Recruiter/admin for file.interviewId

Streaming Implementation:
  - Use Prisma's $queryRawUnsafe with COPY or chunked SELECT
  - Stream directly to response, never load full blob into memory
```

### Implementation

```typescript
// api/src/routes/files.ts

import { Hono } from 'hono'
import { stream } from 'hono/streaming'
import { prisma } from '../lib/db'
import { authMiddleware, optionalAuth } from '../middleware/auth'
import { interviewSessionMiddleware } from '../middleware/interview-session'

const files = new Hono()
files.use('*', optionalAuth, interviewSessionMiddleware)

const SIZE_LIMITS: Record<string, number> = {
  LOGO: 2 * 1024 * 1024,
  RESUME: 10 * 1024 * 1024,
  SCREENSHOT: 5 * 1024 * 1024,
  DOCUMENT: 10 * 1024 * 1024,
}

// Upload file
files.post('/', async (c) => {
  // Auth: session OR interview token
  const session = c.get('session')
  const interviewSession = c.get('interviewSession')

  if (!session && !interviewSession) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const formData = await c.req.formData()
  const file = formData.get('file') as File
  const category = formData.get('category') as string
  const interviewId = formData.get('interviewId') as string | null
  const jobApplicationId = formData.get('jobApplicationId') as string | null

  if (!file || !category) {
    return c.json({ error: 'File and category required' }, 400)
  }

  const resolvedInterviewId = interviewSession?.interview?.id || interviewId || null

  // Validate category permissions
  if (category === 'LOGO' && session?.role !== 'RECRUITER' && session?.role !== 'ADMIN') {
    return c.json({ error: 'Only recruiters can upload logos' }, 403)
  }
  if (category === 'SCREENSHOT' && !interviewSession) {
    return c.json({ error: 'Screenshots require interview token' }, 403)
  }
  if ((category === 'RESUME' || category === 'DOCUMENT') && session && !resolvedInterviewId && !jobApplicationId) {
    return c.json({ error: 'InterviewId or jobApplicationId required' }, 400)
  }

  // Size check
  const maxSize = SIZE_LIMITS[category] || 10 * 1024 * 1024
  if (file.size > maxSize) {
    return c.json({ error: `File too large. Max: ${maxSize / 1024 / 1024}MB` }, 400)
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  const saved = await prisma.file.create({
    data: {
      name: file.name,
      mimeType: file.type,
      size: file.size,
      category: category as any,
      uploadedBy: session?.userId || null,
      interviewId: resolvedInterviewId,
      jobApplicationId: jobApplicationId || null,
      data: buffer,
    },
    select: { id: true, name: true, mimeType: true, size: true, category: true },
  })

  return c.json(saved, 201)
})

// Serve file (streaming)
files.get('/:id', optionalAuth, async (c) => {
  const fileId = c.req.param('id')
  const session = c.get('session')
  const interviewSession = c.get('interviewSession')

  // Get metadata first (no data)
  const file = await prisma.file.findUnique({
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
    },
  })

  if (!file) {
    return c.notFound()
  }

  // Auth check based on category
  if (file.category !== 'LOGO') {
    // Non-public files require auth
    const isOwner = session?.userId === file.uploadedBy
    const isRecruiter = session?.role === 'RECRUITER' || session?.role === 'ADMIN'
    const hasInterviewAccess =
      !!interviewSession && file.interviewId === interviewSession.interview.id

    if (!isOwner && !isRecruiter && !hasInterviewAccess) {
      return c.json({ error: 'Forbidden' }, 403)
    }
  }

  // Stream file data
  return stream(c, async (stream) => {
    // Set headers before streaming
    c.header('Content-Type', file.mimeType)
    c.header('Content-Length', file.size.toString())
    c.header('Cache-Control', 'public, max-age=31536000, immutable')
    c.header('ETag', `"${file.id}"`)

    // Stream from DB in chunks
    const chunkSize = 64 * 1024 // 64KB chunks
    let offset = 0

    while (offset < file.size) {
      const chunk = await prisma.$queryRaw<{ data: Buffer }[]>`
        SELECT substring(data FROM ${offset + 1} FOR ${chunkSize}) as data
        FROM "File"
        WHERE id = ${fileId}
      `

      if (chunk[0]?.data) {
        await stream.write(chunk[0].data)
      }

      offset += chunkSize
    }
  })
})

// Delete file
files.delete('/:id', authMiddleware, async (c) => {
  const fileId = c.req.param('id')
  const session = c.get('session')

  const file = await prisma.file.findUnique({
    where: { id: fileId },
    select: { uploadedBy: true },
  })

  if (!file) {
    return c.notFound()
  }

  // Only owner or admin can delete
  if (file.uploadedBy !== session.userId && session.role !== 'ADMIN') {
    return c.json({ error: 'Forbidden' }, 403)
  }

  await prisma.file.delete({ where: { id: fileId } })

  return c.json({ success: true })
})

export { files as filesRoutes }
```

Note: For recruiter/admin access, validate ownership using `file.interviewId` or `file.jobApplicationId`
before serving non-LOGO files.

---

## Contract: `InterviewSession` TTL & Revocation

### Token Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│                  InterviewSession Lifecycle                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. CREATE (on interview creation)                          │
│     └─ token = nanoid(32)                                   │
│     └─ expiresAt = interview.expiresAt OR now + 7 days      │
│     └─ revokedAt = null                                     │
│                                                              │
│  2. VALIDATE (on each request)                              │
│     └─ Check: token exists                                  │
│     └─ Check: expiresAt > now                               │
│     └─ Check: revokedAt IS NULL                             │
│     └─ Update: lastAccessedAt = now, accessCount++          │
│                                                              │
│  3. REVOKE (manual by recruiter)                            │
│     └─ Set: revokedAt = now                                 │
│     └─ Token immediately invalid                            │
│                                                              │
│  4. EXPIRE (automatic)                                       │
│     └─ Cron job cleans up expired sessions                  │
│     └─ expiresAt < now → session invalid                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### API Endpoints

```
POST /interviews/:id/sessions
  - Create new session token for interview
  - Auth: Recruiter only
  - Response: { token, expiresAt }

DELETE /interviews/:id/sessions/:sessionId
  - Revoke specific session
  - Auth: Recruiter only
  - Sets revokedAt = now

DELETE /interviews/:id/sessions
  - Revoke ALL sessions for interview
  - Auth: Recruiter only
  - Bulk revocation

GET /interviews/:id/sessions
  - List active sessions (admin/recruiter)
  - Shows accessCount, lastAccessedAt
```

### Middleware Implementation

```typescript
// api/src/middleware/interview-session.ts

import { Context, Next } from 'hono'
import { prisma } from '../lib/db'

export async function interviewSessionMiddleware(c: Context, next: Next) {
  // Token from header or query param
  const token = c.req.header('X-Interview-Token') || c.req.query('token')

  if (!token) {
    // Not using interview token - pass through for other auth methods
    return next()
  }

  const session = await prisma.interviewSession.findUnique({
    where: { token },
    include: {
      interview: {
        select: {
          id: true,
          status: true,
          jobRole: true,
          timeLimitMinutes: true,
          expiresAt: true,
          recruiterId: true,
        },
      },
    },
  })

  // Validation checks
  if (!session) {
    return c.json({ error: 'Invalid interview token' }, 401)
  }

  if (session.revokedAt) {
    return c.json({ error: 'Interview access has been revoked' }, 401)
  }

  if (session.expiresAt < new Date()) {
    return c.json({ error: 'Interview link has expired' }, 401)
  }

  if (session.interview.status === 'EXPIRED') {
    return c.json({ error: 'Interview has expired' }, 410)
  }

  // Update access tracking (fire and forget)
  prisma.interviewSession.update({
    where: { id: session.id },
    data: {
      lastAccessedAt: new Date(),
      accessCount: { increment: 1 },
    },
  }).catch(() => {}) // Non-blocking

  // Attach to context
  c.set('interviewSession', session)
  c.set('interview', session.interview)

  await next()
}

// Helper to create session
export async function createInterviewSession(interviewId: string, expiresAt?: Date) {
  const { nanoid } = await import('nanoid')

  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    select: { expiresAt: true },
  })

  const defaultExpiry = new Date()
  defaultExpiry.setDate(defaultExpiry.getDate() + 7)

  const session = await prisma.interviewSession.create({
    data: {
      interviewId,
      token: nanoid(32),
      expiresAt: expiresAt || interview?.expiresAt || defaultExpiry,
    },
  })

  return session
}

// Helper to revoke session
export async function revokeInterviewSession(sessionId: string) {
  return prisma.interviewSession.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
  })
}

// Helper to revoke all sessions for interview
export async function revokeAllInterviewSessions(interviewId: string) {
  return prisma.interviewSession.updateMany({
    where: { interviewId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}
```

---

## Socket.io Event Emit Points

Explicit locations where Socket.io events are emitted:

| Event | Route/Handler | Trigger |
|-------|---------------|---------|
| `email:status` | `POST /webhooks/brevo` | Brevo delivery webhook |
| `whatsapp:status` | `POST /webhooks/whatsapp` | WhatsApp delivery webhook |
| `interview:started` | `PATCH /interviews/:id/status` | Status → IN_PROGRESS |
| `interview:completed` | `PATCH /interviews/:id/status` | Status → COMPLETED |
| `interview:scored` | `POST /interviews/:id/evaluate` | Evaluation complete |
| `application:new` | `POST /jobs/:id/applications` | New application |
| `application:updated` | `PATCH /applications/:id` | Status change |

---

## WebSocket Libraries

### Hono WebSocket (Voice Route)

```typescript
// api/src/index.ts

import { serve } from '@hono/node-server'
import { createNodeWebSocket } from '@hono/node-ws'
import { app } from './app'

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app })

// Export for use in routes
export { upgradeWebSocket }

const server = serve({ fetch: app.fetch, port: 3000 })
injectWebSocket(server)
```

### Cartesia TTS (Node WS Client)

```typescript
// api/src/services/voice/tts.ts

import WebSocket from 'ws'  // Node ws package

export class CartesiaTTS implements TTSProvider {
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async *stream(text: string): AsyncGenerator<Buffer> {
    const ws = new WebSocket('wss://api.cartesia.ai/tts/websocket')

    // Wait for connection
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve())
      ws.on('error', (err) => reject(err))
    })

    // Send request
    ws.send(JSON.stringify({
      api_key: this.apiKey,
      model_id: 'sonic-english',
      voice: { mode: 'id', id: 'a0e99841-438c-4a64-b679-ae501e7d6091' },
      output_format: { container: 'raw', encoding: 'pcm_s16le', sample_rate: 24000 },
      transcript: text,
    }))

    // Receive audio chunks
    try {
      for await (const data of this.receiveChunks(ws)) {
        yield data
      }
    } finally {
      ws.close()
    }
  }

  private async *receiveChunks(ws: WebSocket): AsyncGenerator<Buffer> {
    const queue: Buffer[] = []
    let done = false
    let resolver: (() => void) | null = null

    ws.on('message', (data: Buffer | string) => {
      if (Buffer.isBuffer(data)) {
        queue.push(data)
        resolver?.()
      } else {
        try {
          const msg = JSON.parse(data.toString())
          if (msg.done) done = true
          resolver?.()
        } catch {}
      }
    })

    ws.on('close', () => {
      done = true
      resolver?.()
    })

    ws.on('error', () => {
      done = true
      resolver?.()
    })

    while (!done || queue.length > 0) {
      if (queue.length > 0) {
        yield queue.shift()!
      } else if (!done) {
        await new Promise<void>((r) => { resolver = r })
      }
    }
  }

  async synthesize(text: string): Promise<Buffer> {
    const chunks: Buffer[] = []
    for await (const chunk of this.stream(text)) {
      chunks.push(chunk)
    }
    return Buffer.concat(chunks)
  }
}
```

---

## Environment Variables

```bash
# .env.example

# Core
NODE_ENV=development
PORT=3000
API_URL=http://localhost:3000
FRONTEND_URL=http://localhost:5173

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/vantahire

# Redis (sessions only - no Session model)
REDIS_URL=redis://localhost:6379

# OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=

# Voice AI
VOICE_TTS_PROVIDER=deepgram
VOICE_TTS_LOW_LATENCY=false
DEEPGRAM_API_KEY=
GROQ_API_KEY=
CARTESIA_API_KEY=

# Google Cloud Storage (videos only)
GCS_PROJECT_ID=
GCS_BUCKET_NAME=vantahire-videos
GCS_CREDENTIALS=

# Email
BREVO_API_KEY=
BREVO_SENDER_EMAIL=noreply@vantahire.com
BREVO_SENDER_NAME=VantaHire

# WhatsApp
WHATSAPP_API_KEY=
WHATSAPP_PHONE_ID=
```

---

## OAuth-Only Cutover Strategy

- Migrate Supabase users into `User` with `provider="legacy"` and `providerId=<userId>` as placeholders.
- On OAuth callback: if email matches a legacy user, update `provider/providerId` and log in.
- If email already mapped to a different provider, block and require admin merge.
- Disable Supabase auth flows at cutover (password reset/verify/sign-in); frontend becomes OAuth-only.
- Candidate access uses InterviewSession links; re-issue invites for any active interviews.

## Data Migration Plan

1. Export Supabase tables: users, profiles, candidate_profiles, user_roles, interviews, interview_messages, jobs,
   job_applications, email_messages, whatsapp_messages, api_keys, api_usage_logs, admin_settings, onboarding_reminders.
2. Transform + import into PostgreSQL (map snake_case → camelCase, enums → upper-case).
3. Storage migration:
   - `company-logos` → File (LOGO) and set `RecruiterProfile.logoFileId`.
   - `interview-documents` → File (RESUME/DOCUMENT/SCREENSHOT) with `interviewId` or `jobApplicationId`.
   - recordings → GCS, set `Interview.recordingGcsKey`.
4. Create InterviewSession tokens for each interview, set `interviewUrl`.
5. Verify counts and spot-check critical flows; keep Supabase read-only until verified.

## Phase 6 Migration Checklist + Script (Draft)

### Checklist
- [ ] Freeze writes in Supabase (maintenance window) and take a full backup.
- [ ] Export Supabase tables and storage buckets.
- [ ] Transform data to Prisma schema (IDs, enums, snake_case → camelCase).
- [ ] Import into Railway Postgres in dependency order.
- [ ] Generate InterviewSession tokens + update interview URLs.
- [ ] Re-send active interview links and verify key flows.
- [ ] Cut over frontend API URL and disable Supabase auth.

### Script Outline (draft)
```bash
# 0) Env
export SUPABASE_DB_URL="postgres://..."
export RAILWAY_DB_URL="postgres://..."
export EXPORT_DIR="./migration"

mkdir -p "$EXPORT_DIR"

# 1) Export data (tables)
pg_dump "$SUPABASE_DB_URL" \
  --data-only \
  --column-inserts \
  --rows-per-insert=1000 \
  --table=public.users \
  --table=public.profiles \
  --table=public.candidate_profiles \
  --table=public.user_roles \
  --table=public.jobs \
  --table=public.interviews \
  --table=public.interview_messages \
  --table=public.job_applications \
  --table=public.email_messages \
  --table=public.whatsapp_messages \
  --table=public.api_keys \
  --table=public.api_usage_logs \
  --table=public.admin_settings \
  --table=public.onboarding_reminders \
  > "$EXPORT_DIR/supabase_data.sql"

# 2) Export storage buckets (use Supabase CLI or S3-compatible tooling)
# buckets: company-logos, interview-documents, recordings

# 3) Transform (draft - implement as script)
# node scripts/migration/transform.ts --in "$EXPORT_DIR/supabase_data.sql" --out "$EXPORT_DIR/transformed.json"

# 4) Import
# node scripts/migration/load.ts --db "$RAILWAY_DB_URL" --data "$EXPORT_DIR/transformed.json"

# 5) Post-import: generate InterviewSession tokens
# node scripts/migration/create_interview_sessions.ts --db "$RAILWAY_DB_URL"
```

### Verification Queries (examples)
```sql
-- Compare counts with Supabase exports
select count(*) from "User";
select count(*) from "Job";
select count(*) from "Interview";
select count(*) from "JobApplication";
select count(*) from "File";
```

## Implementation Phases

### Phase 1: API Skeleton
- [x] Folder structure `api/`
- [x] Prisma schema (final)
- [x] Core libs: db, redis, config, socket
- [x] Auth routes (OAuth stubs)
- [x] Health check endpoint
- [x] Docker + compose
- [ ] Deploy to Railway

### Phase 2: Core CRUD
- [x] Users/profiles routes
- [x] Interviews CRUD + InterviewSession
- [x] Jobs CRUD
- [x] Applications CRUD
- [x] Files upload/serve (streaming)

### Phase 3: Voice Pipeline
- [x] Deepgram STT
- [x] Groq LLM
- [x] Deepgram TTS
- [x] Cartesia TTS
- [x] Voice WebSocket route

### Phase 4: Integrations
- [x] Brevo email sending
- [x] WhatsApp invites
- [x] Webhooks (Brevo, WhatsApp)
- [x] Socket.io realtime events
- [x] GCS video upload

### Phase 5: Frontend Refactor ✅
- [x] Create `src/lib/api.ts` client
- [x] Replace Auth pages → OAuth
- [x] Replace `useCandidateAuth` → `useInterviewSession`
- [x] Replace Supabase SDK calls → API client
- [x] Replace Realtime → Socket.io hooks
- [x] Remove `src/integrations/supabase/` folder
- [x] Remove/archive `supabase/` folder (old migrations/functions)

### Phase 6: Data Migration + Cutover
- [ ] Export Supabase data + storage objects
- [ ] Transform → Prisma schema + load into Postgres
- [ ] Create InterviewSession tokens + update interview URLs
- [ ] Re-send active interview links
- [ ] Final verification + cutover

---

## Next: Phase 6 Data Migration + Cutover

Start export/transform/load and plan cutover verification.
