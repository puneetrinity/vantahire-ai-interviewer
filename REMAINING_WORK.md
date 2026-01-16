# Remaining Test Work

This document tracks manual and opt-in testing tasks that require external resources or human verification.

## Current Test Status

| Category | Tests | Status |
|----------|-------|--------|
| Unit + Mocked Integration | 458 | Passing |
| E2E (Playwright) | 45 | Passing |
| DB Integration | 88 | Passing |
| **Total Automated** | **591** | **All Passing** |

### Test Helpers

Integration tests use typed helpers from `api/tests/helpers/mock.ts` to avoid `as any`:

```typescript
import { asMock, readJson } from '../helpers/mock.js';

// Wrap partial mock objects with explicit types
vi.mocked(db.job.findFirst).mockResolvedValueOnce(
  asMock<Job>({ id: 'job-1', title: 'Engineer' })
);

// Typed response parsing
const data = await readJson<{ id: string }>(res);
```

For models with relations, define extended interfaces:
```typescript
interface UserWithProfiles extends User {
  recruiterProfile?: Partial<RecruiterProfile> | null;
}
```

---

## 1. Migration Validation (Opt-in)

**Purpose:** Verify data integrity after migrating from Supabase to Railway.

**Location:** `api/tests/migration/validation.test.ts`

**How to Run:**
```bash
cd api

# Set expected row counts file path
export MIGRATION_EXPECTED_PATH=./migration_data/row_counts.txt

# Run validation against real migrated database
MIGRATION_VERIFY=1 npm run test:migration
```

**Prerequisites:**
- Migrated database accessible via `DATABASE_URL`
- Expected row counts file with format (colon-separated):
  ```
  users: 1234
  jobs: 567
  interviews: 890
  applications: 456
  files: 123
  ```

**What it validates:**
- Row counts match expected values per table
- Interview session tokens not expired

---

## 2. Load Testing

**Purpose:** Validate system handles 25 concurrent interviews + 200 concurrent API requests.

**Location:** `load/load-test.js`

**Prerequisites:**
- [k6](https://k6.io/docs/getting-started/installation/) installed
- API server running (staging or local)

**How to Run:**
```bash
# Basic run against local
k6 run load/load-test.js --env API_BASE_URL=http://localhost:3000

# Run against staging with results output
k6 run load/load-test.js \
  --env API_BASE_URL=https://api.staging.vantahire.com \
  --out json=load-results.json
```

**Scenarios:**
1. **API Load** (200 VUs): Ramps up to 200 concurrent users hitting health, jobs, and job detail endpoints
2. **Interview Simulation** (25 VUs): Simulates 25 concurrent interview sessions with message exchange patterns

**Thresholds:**
- HTTP p95 latency < 2000ms
- API p95 latency < 1000ms
- Interview p95 latency < 3000ms
- Error rate < 10%

**Output:** Summary printed to console + `load-test-results.json` for detailed analysis

---

## 3. Manual Provider Checks

These require human verification with real accounts and external services.

### 3.1 OAuth Authentication

**Providers:** Google, LinkedIn

**Test Steps:**
1. Go to staging login page
2. Click "Sign in with Google"
3. Complete Google OAuth flow
4. Verify redirect back to dashboard with user info
5. Repeat for LinkedIn

**What to verify:**
- OAuth redirect works
- User profile populated correctly
- Session cookie set
- Role assigned correctly (first-time vs returning user)

### 3.2 Brevo Email Delivery

**Test Steps:**
1. Create an interview in recruiter dashboard
2. Send email invite to a real email address
3. Check inbox for delivery
4. Open email and click interview link
5. Verify webhook updates `EmailMessage` status

**What to verify:**
- Email delivered (not spam)
- Email content renders correctly
- Interview link works
- Webhook fires on delivery/open events
- `EmailMessage.status` updated in database

### 3.3 WhatsApp Invite (Meta Business)

**Test Steps:**
1. Create an interview with candidate phone number
2. Send WhatsApp invite
3. Check WhatsApp for message
4. Click interview link
5. Verify webhook updates `WhatsAppMessage` status

**What to verify:**
- Message delivered
- Template renders correctly
- Interview link works
- Webhook fires on delivery/read events
- `WhatsAppMessage.status` updated in database

### 3.4 GCS Video Upload/Playback

**Test Steps:**
1. Start a voice interview
2. Complete the interview (triggers recording upload)
3. View interview details as recruiter
4. Click recording playback link

**What to verify:**
- Signed upload URL generated
- Recording uploads successfully
- `recordingGcsKey` saved to interview
- Signed download URL generated
- Video plays in browser

### 3.5 Voice Latency & Quality

**Test Steps:**
1. Start voice interview on staging
2. Speak and wait for AI response
3. Measure subjective latency (time from speech end to audio start)
4. Assess audio quality (clarity, artifacts, volume)

**What to verify:**
- STT transcription accuracy
- LLM response relevance
- TTS audio quality
- End-to-end latency acceptable (<3s target)

---

## 4. UI-Driven E2E (Optional Enhancement)

**Current state:** `e2e/crud-flows.spec.ts` uses API calls directly for CRUD operations.

**To convert to UI-driven:**

```typescript
// Instead of:
const response = await request.post(`${API_URL}/jobs`, { data: {...} });

// Use UI interactions:
await page.goto('/dashboard/jobs/new');
await page.fill('[name="title"]', 'E2E Test Job');
await page.fill('[name="description"]', 'Created by E2E test');
await page.selectOption('[name="jobType"]', 'FULL_TIME');
await page.click('button[type="submit"]');
await expect(page).toHaveURL(/\/dashboard\/jobs\//);
```

**Benefits:**
- Tests actual UI forms and validation
- Catches frontend-only bugs
- More realistic user flow

**Trade-offs:**
- Slower execution
- More brittle (UI changes break tests)
- API tests already cover backend logic

**Recommendation:** Keep API-backed CRUD tests for fast CI feedback, add selective UI tests for critical flows (job creation, interview start, application submission).

---

## Checklist

- [ ] Run migration validation after data migration
- [ ] Execute load test on staging
- [ ] Manual: Google OAuth flow
- [ ] Manual: LinkedIn OAuth flow
- [ ] Manual: Brevo email delivery + webhook
- [ ] Manual: WhatsApp delivery + webhook
- [ ] Manual: GCS video upload/playback
- [ ] Manual: Voice interview latency check
- [ ] (Optional) Convert CRUD flows to UI-driven

---

## Quick Commands

```bash
# Run all automated tests
cd api && npm test                    # Unit + mocked (458 tests)
cd api && npm run test:db             # DB integration (88 tests)
cd .. && npm run test:e2e             # E2E (45 tests)

# Load testing
k6 run load/load-test.js --env API_BASE_URL=http://localhost:3000

# Migration validation (opt-in)
cd api && MIGRATION_VERIFY=1 npm run test:migration

# Type checking
cd api && npx tsc --project tsconfig.test.json
```
