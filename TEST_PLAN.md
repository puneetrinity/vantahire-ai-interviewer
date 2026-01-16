# VantaHire Test Plan (Railway Migration)

## Scope
Validate the new Hono + Prisma + Redis stack, voice pipeline, and frontend migration
to ensure parity with Supabase behavior and safe cutover.

## Environments
- Local: Docker Compose (Postgres + Redis) + Vite + API
- Staging: Railway project mirroring production env vars
- Production: post-cutover smoke only

## Tooling (selected)
- API/unit: Vitest + Supertest
- E2E: Playwright
- Load: k6 (preferred) or Artillery
- Lint/type: ESLint + tsc (existing)

## Test Data / Fixtures
- Seed users: recruiter, candidate, admin
- Seed jobs: draft + active + closed
- Seed interviews: pending + in_progress + completed + expired
- Seed applications: full status ladder
- Seed files: logo, resume, screenshot, document
- Seed InterviewSession tokens (valid, expired, revoked)

## Test Types and Coverage

### 1) Unit Tests (fast, isolated)
- Config validation: required env vars and defaults (including TTS_PROVIDER + CARTESIA_API_KEY coupling)
- Auth utilities: session creation, token parsing, expiry logic
- File size/purpose validation (shared rules)
- Status transition validators - jobs/applications/interviews (shared rules)
- Voice pipeline helpers: prompt building, TTS provider selection
- Webhook signature validation (Brevo + WhatsApp)
- API key generation, hashing, and validation logic
- Cron job business logic (interview expiration, session cleanup, rate limit reset)

**Shared Rules Architecture:**
Business rules in `src/lib/rules/` are imported by both routes and tests to ensure:
- Tests validate actual production logic (no drift)
- Single source of truth for status transitions and file validations

### 2) API Integration Tests (DB + Redis)
**Auth + Sessions**
- OAuth callback creates session; `/auth/me` returns user
- Session invalidation on logout

**Users / Profiles**
- Recruiter profile update + logo file wiring
- Candidate profile update + resume wiring

**Jobs**
- Recruiter CRUD
- Admin approval workflow
- Public listing visibility rules

**Applications**
- Candidate apply → auto-copy resume
- Status transitions enforce allowed ladder
- Recruiter notes update
- Candidate update allowed only when pending

**Interviews**
- Create interview → InterviewSession token generated
- Candidate token access works (header + query)
- Status changes emit socket events

**Files**
- Upload by recruiter (logo, docs)
- Upload by candidate using interview token
- Access rules by owner/candidate/recruiter
- Streaming endpoint returns partial content

**Videos (GCS)**
- Signed upload URL generated
- Confirm saves recordingKey
- Signed download URL generated

**API Keys**
- Create/revoke keys
- Rate limit tracking

**Webhooks**
- Brevo delivery/open/bounce updates EmailMessage
- WhatsApp status updates WhatsAppMessage

**Cron Jobs**
- Expire interviews (sets status + emits)
- Cleanup sessions, reset API usage

### 3) Realtime / Socket.io
- join:recruiter only for owner
- join:interview only for valid interview
- Emitted events: interview:update, email:status, whatsapp:status, application:new

### 4) Voice Pipeline (integration)
- WS auth gating by interview token
- STT → LLM → TTS flow returns audio
- Empty transcript returns no audio
- TTS Provider selection: Deepgram (default) or Cartesia (requires CARTESIA_API_KEY in config)

### 5) Frontend E2E (critical flows)
**Recruiter**
- OAuth login, dashboard data loads
- Create job → approve (admin) → public listing
- Create interview, send email/WhatsApp invite
- View recording link and screenshots

**Candidate**
- Open invite link (token) → start interview
- Upload resume/screenshots
- Voice interview completes and evaluation stored
- Apply to job, update/withdraw application

**Admin**
- Approve/reject jobs
- View application list

**E2E Runbook**

Prerequisites:
- PostgreSQL running (port 5433 or configured in `api/.env`)
- Redis running
- Database seeded with test data

```bash
# 1. Ensure api/.env has required vars
cd api
cat .env | grep -E "DATABASE_URL|CLIENT_URL|E2E_AUTH_TOKEN"
# DATABASE_URL=postgresql://...
# CLIENT_URL=http://localhost:8080
# E2E_AUTH_TOKEN=dev-e2e-token

# 2. Push schema and seed database
npm run db:push
npm run db:seed

# 3. Start API server (terminal 1)
npm run dev
# Server running at http://localhost:3000

# 4. Start frontend (terminal 2)
cd ..  # back to root
npm run dev
# Vite running at http://localhost:8080

# 5. Run E2E tests (terminal 3)
E2E_AUTH_TOKEN=dev-e2e-token \
E2E_API_URL=http://localhost:3000 \
PLAYWRIGHT_BASE_URL=http://localhost:8080 \
npm run test:e2e
```

**Auth Storage States:**
- Global setup (`e2e/global-setup.ts`) creates auth cookies via `/auth/test-login`
- Storage states saved to `e2e/.auth/{recruiter,candidate,admin}.json`
- Tests use `test.use({ storageState: STORAGE_STATE.xxx })` for authenticated flows

**Seeded Test Data (from `api/prisma/seed.ts`):**
| Entity | ID | Notes |
|--------|-----|-------|
| Recruiter | `00000000-0000-4000-8000-000000000001` | recruiter@test.com |
| Candidate | `00000000-0000-4000-8000-000000000002` | candidate@test.com |
| Admin | `00000000-0000-4000-8000-000000000003` | admin@test.com |
| Job 1 | `00000000-0000-4000-8000-000000000021` | Active job |
| Job 2 | `00000000-0000-4000-8000-000000000022` | Draft job |
| Interview 1 | `00000000-0000-4000-8000-000000000031` | Text interview |
| Interview 2 | `00000000-0000-4000-8000-000000000032` | Voice interview |
| Application 1 | `00000000-0000-4000-8000-000000000051` | Pending application |

**Interview Tokens:**
- `test-interview-token` → Interview 1
- `test-voice-token` → Interview 2

### 6) Migration Validation
- Record counts match export per table
- Spot-check 10 random users: profiles, jobs, interviews, applications, files
- Interview links from migrated data are valid and not expired
- GCS recordings available for completed interviews

**Opt-in DB Validation:**
```bash
# Run migration validation against real database
MIGRATION_VERIFY=1 npm run test:migration

# Requires MIGRATION_EXPECTED_PATH or migration_data/row_counts.txt
```

### 7) Non-Functional
- Load: 25 concurrent interviews + 200 concurrent API requests
- Voice latency test (avg/95p)
- File streaming does not exceed memory limits
- Security: rate limits, auth bypass attempts, token replay

## Test Execution Strategy

### Test Split
Tests are split into two categories with separate execution:

| Category | Command | Database | When to Run |
|----------|---------|----------|-------------|
| **Unit + Mocked Integration** | `npm test` | Mocked (vi.mock) | Every commit, fast feedback |
| **DB Integration** | `npm run test:db` | Real Postgres | CI only, or local with DB |

### Local Development

```bash
# Fast feedback (no DB required) - ~480 tests
npm test

# Run with watch mode
npm run test:watch
```

### Local DB Tests (optional)

```bash
# 1. Start Postgres locally (Docker or native)
docker run -d --name pg-test -p 5432:5432 \
  -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=vantahire_test \
  postgres:15

# 2. Set DATABASE_URL
export DATABASE_URL="postgresql://test:test@localhost:5432/vantahire_test"

# 3. Setup DB and seed
npm run test:db:setup

# 4. Run DB tests
npm run test:db
```

### CI Pipeline (GitHub Actions)

The CI workflow (`.github/workflows/ci.yml`) runs:
1. **test-unit**: Mocked tests (`npm test`) - fast, no services
2. **test-db**: DB integration tests with Postgres + Redis services
3. **build**: TypeScript compilation check

### Test Files

```
api/tests/
├── unit/              # Pure unit tests (no DB)
│   ├── config.test.ts
│   ├── auth.test.ts
│   ├── status-transitions.test.ts  # Uses shared rules from src/lib/rules/
│   ├── file-validation.test.ts     # Uses shared rules from src/lib/rules/
│   ├── voice-helpers.test.ts
│   ├── security.test.ts
│   ├── webhooks.test.ts            # Brevo + WhatsApp webhook validation
│   ├── api-keys.test.ts            # API key generation + validation
│   └── cron-jobs.test.ts           # Scheduled job logic
├── integration/       # Mocked API integration tests
│   ├── auth.test.ts
│   ├── jobs.test.ts
│   ├── applications.test.ts
│   ├── interviews.test.ts
│   ├── files.test.ts
│   ├── socket.test.ts
│   └── voice-pipeline.test.ts
├── db/                # Real DB integration tests (CI only)
│   ├── setup.ts
│   ├── users.db.test.ts
│   ├── jobs.db.test.ts
│   ├── interviews.db.test.ts
│   ├── applications.db.test.ts
│   ├── files.db.test.ts
│   ├── webhooks.db.test.ts    # EmailMessage + WhatsAppMessage
│   └── api-keys.db.test.ts    # API key CRUD + rate limiting
├── migration/         # Migration validation (opt-in with MIGRATION_VERIFY=1)
│   └── validation.test.ts
└── helpers/
    └── test-utils.ts

api/src/lib/rules/     # Shared business rules (used by routes + tests)
├── index.ts
├── status-transitions.ts
└── file-rules.ts

e2e/                   # Playwright E2E tests (50+ tests)
├── smoke.spec.ts          # Basic page load
├── recruiter.spec.ts      # Recruiter dashboard, jobs, interviews, applications
├── candidate.spec.ts      # Interview access, candidate dashboard, public jobs
├── admin.spec.ts          # Admin dashboard, job approval, user management
├── voice-interview.spec.ts # Voice interview flow with media mocking
├── file-upload.spec.ts    # File upload and access control tests
├── crud-flows.spec.ts     # API CRUD operations (jobs, interviews, applications)
├── global-setup.ts        # Auth storage state generation
├── fixtures/              # Test files (resume, documents)
└── helpers/
    ├── auth.ts            # Storage state paths + E2E config
    └── seed.ts            # Seeded IDs and tokens for tests

load/                  # k6 load tests
├── load-test.js       # Full scenario: 25 interviews + 200 API VUs
└── smoke.js
```

## Automation Order (suggested)
1. Unit tests
2. API integration tests (mocked)
3. DB integration tests (CI)
4. Voice pipeline integration
5. E2E critical flows
6. Load + security checks
7. Manual validation of external providers

## Automation vs Manual (first pass)

### Decision rule
- **Automate** when: high usage, high regression risk, data integrity impact, or easy to run in CI.
- **Manual** when: relies on third-party delivery (email/WhatsApp), real OAuth, or needs human UX judgment.

### Automate (first pass)
- Unit: config validation, auth/session utilities, status transitions.
- API integration: users, jobs, interviews, applications, files, interview sessions.
- Realtime: socket join rules + event emits.
- Voice pipeline: auth gating + provider selection + basic STT→LLM→TTS flow (mock/recorded audio).
- E2E: recruiter create job/interview + candidate token flow + application lifecycle.

### Manual (first pass)
- OAuth with real Google/LinkedIn accounts in staging.
- Brevo + WhatsApp delivery confirmation and webhook accuracy.
- GCS upload/playback in a real browser session.
- Voice latency and audio quality checks (subjective).
- Production smoke after cutover.

## Exit Criteria
- All P0/P1 tests pass on staging
- Data migration validation complete
- No Sev-1/Sev-2 bugs open
- Production smoke test passes
