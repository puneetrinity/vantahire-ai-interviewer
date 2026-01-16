# VantaHire Migration Scripts

Scripts for migrating data from Supabase to Railway Postgres + GCS.

## Prerequisites

- `pg_dump` and `psql` installed (for export.sh)
- Node.js 18+
- Access to both Supabase and Railway Postgres databases
- (Optional) Google Cloud credentials for recording migration

## Migration Steps

### 1. Freeze Supabase & Export

```bash
# Set environment variables
export SUPABASE_DB_URL="postgres://postgres:password@db.xxx.supabase.co:5432/postgres"
export EXPORT_DIR="./migration_data"

# Run export (includes user_roles table)
chmod +x scripts/migration/export.sh
./scripts/migration/export.sh
```

### 2. Download Storage Buckets

```bash
# Using Supabase CLI
supabase storage download -b company-logos -o $EXPORT_DIR/buckets/company-logos
supabase storage download -b interview-documents -o $EXPORT_DIR/buckets/interview-documents
supabase storage download -b resumes -o $EXPORT_DIR/buckets/resumes
supabase storage download -b recordings -o $EXPORT_DIR/buckets/recordings
```

### 3. Transform Data

Converts snake_case to camelCase, maps enum values, and merges `user_roles` into `User.role`:

```bash
npx tsx scripts/migration/transform.ts \
  --in ./migration_data \
  --out ./migration_data/transformed
```

### 4. Import to Railway Postgres

```bash
# Set Railway database URL
export DATABASE_URL="postgres://postgres:password@railway.host:5432/railway"

# Dry run first
npx tsx scripts/migration/import.ts \
  --in ./migration_data/transformed \
  --dry-run

# Actual import
npx tsx scripts/migration/import.ts \
  --in ./migration_data/transformed \
  --skip-existing  # Optional: skip records that already exist
```

### 5. Migrate Files to Postgres

Migrates logos, resumes, and documents from Supabase storage to Postgres `File` table:
If storage object IDs are UUIDs, the script preserves them to keep existing logo/resume references intact.
It also wires missing logo/resume links when possible.

```bash
# Dry run
npx tsx scripts/migration/migrate-files.ts \
  --in ./migration_data \
  --dry-run

# Actual migration
npx tsx scripts/migration/migrate-files.ts \
  --in ./migration_data \
  --skip-existing

# Or migrate specific bucket
npx tsx scripts/migration/migrate-files.ts \
  --in ./migration_data \
  --bucket company-logos
```

### 6. Migrate Recordings to GCS

Uploads recording files to Google Cloud Storage and updates `Interview.recordingGcsKey`:

```bash
# Set GCS credentials
export GCS_PROJECT_ID="your-project"
export GCS_BUCKET="your-bucket"
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"

# Dry run
npx tsx scripts/migration/migrate-recordings.ts \
  --in ./migration_data \
  --dry-run

# Actual migration
npx tsx scripts/migration/migrate-recordings.ts \
  --in ./migration_data \
  --skip-existing
```

### 7. Generate Interview Session Tokens

Creates tokens for existing interviews:

```bash
export CLIENT_URL="https://vantahire.com"

# Dry run
npx tsx scripts/migration/create-interview-sessions.ts --dry-run

# Create sessions for all interviews
npx tsx scripts/migration/create-interview-sessions.ts

# Or only for PENDING interviews
npx tsx scripts/migration/create-interview-sessions.ts --pending-only --expiry-days 14
```

### 8. Verify Import

```bash
# Basic verification
npx tsx scripts/migration/verify.ts

# Compare with expected counts from export
npx tsx scripts/migration/verify.ts --expected ./migration_data/row_counts.txt
```

## Complete Migration Flow

```bash
# From api/ directory

# 1. Export
export SUPABASE_DB_URL="postgres://..."
export EXPORT_DIR="./migration_data"
./scripts/migration/export.sh

# 2. Download buckets (run each)
supabase storage download -b company-logos -o $EXPORT_DIR/buckets/company-logos
supabase storage download -b interview-documents -o $EXPORT_DIR/buckets/interview-documents
supabase storage download -b resumes -o $EXPORT_DIR/buckets/resumes
supabase storage download -b recordings -o $EXPORT_DIR/buckets/recordings

# 3. Transform
npx tsx scripts/migration/transform.ts --in ./migration_data --out ./migration_data/transformed

# 4. Import data
export DATABASE_URL="postgres://..."
npx tsx scripts/migration/import.ts --in ./migration_data/transformed

# 5. Migrate files
npx tsx scripts/migration/migrate-files.ts --in ./migration_data

# 6. Migrate recordings
export GCS_PROJECT_ID="..."
export GCS_BUCKET="..."
npx tsx scripts/migration/migrate-recordings.ts --in ./migration_data

# 7. Generate session tokens
export CLIENT_URL="https://..."
npx tsx scripts/migration/create-interview-sessions.ts

# 8. Verify
npx tsx scripts/migration/verify.ts --expected ./migration_data/row_counts.txt
```

## Post-Migration

1. **Re-send interview links** - Use CSV output from step 7
2. **Test key flows:**
   - OAuth login (Google/LinkedIn)
   - Create interview → send invite → candidate access
   - Complete interview → AI evaluation
   - API key creation and validation
   - File upload/download
   - Recording playback
3. **Cut over frontend** - Update `VITE_API_URL` in frontend
4. **Disable Supabase auth** - In Supabase dashboard

## File Structure

### Input (Supabase export)
```
migration_data/
├── users.json
├── user_roles.json          # NEW: merged into User.role
├── profiles.json
├── candidate_profiles.json
├── jobs.json
├── interviews.json
├── interview_messages.json
├── job_applications.json
├── email_messages.json
├── whatsapp_messages.json
├── api_keys.json
├── api_usage_logs.json
├── admin_settings.json
├── onboarding_reminders.json
├── storage_objects.json     # Supabase storage metadata
├── row_counts.txt
└── buckets/
    ├── company-logos/       # → File table (LOGO)
    ├── interview-documents/ # → File table (DOCUMENT)
    ├── resumes/             # → File table (RESUME)
    └── recordings/          # → GCS + Interview.recordingGcsKey
```

### Output (Transformed for Prisma)
```
migration_data/transformed/
├── User.json
├── RecruiterProfile.json
├── CandidateProfile.json
├── Job.json
├── Interview.json
├── InterviewMessage.json
├── JobApplication.json
├── EmailMessage.json
├── WhatsAppMessage.json
├── ApiKey.json
├── ApiUsageLog.json
├── AdminSettings.json
└── OnboardingReminder.json
```

## Data Mapping

### User Roles
If roles are stored in a separate `user_roles` table:
- `transform.ts` reads `user_roles.json`
- Builds a `user_id -> role` map
- Applies role from `user_roles` when transforming users (overrides `users.role`)

### Enum Mappings

| Supabase | Prisma |
|----------|--------|
| `recruiter` | `RECRUITER` |
| `candidate` | `CANDIDATE` |
| `admin` | `ADMIN` |
| `draft` | `DRAFT` |
| `active` | `ACTIVE` |
| `pending` | `PENDING` |
| `in_progress` | `IN_PROGRESS` |
| `completed` | `COMPLETED` |

### Field Renames (snake_case → camelCase)

| Supabase | Prisma |
|----------|--------|
| `full_name` | `fullName` |
| `avatar_url` | `avatarUrl` |
| `recruiter_id` | `recruiterId` |
| `job_role` | `jobRole` |
| `candidate_email` | `candidateEmail` |
| `time_limit_minutes` | `timeLimitMinutes` |
| etc. | etc. |

### Storage Migration

| Supabase Bucket | Target | Migration Script |
|-----------------|--------|------------------|
| `company-logos` | `File` table (LOGO) | `migrate-files.ts` |
| `resumes` | `File` table (RESUME) | `migrate-files.ts` |
| `interview-documents` | `File` table (DOCUMENT) | `migrate-files.ts` |
| `recordings` | GCS + `Interview.recordingGcsKey` | `migrate-recordings.ts` |

## Troubleshooting

### Import fails with foreign key error
Import order matters. The scripts import in dependency order (Users → Profiles → Jobs → Interviews → etc.)

### Duplicate key errors
Use `--skip-existing` flag to skip records that already exist.

### Missing provider ID
If users don't have OAuth provider info, the transform script uses `provider="legacy"` and the user ID as `providerId`. You may need to manually reconcile these.

### Session tokens not working
Ensure `CLIENT_URL` is set correctly when running `create-interview-sessions.ts`.

### Files not found during migration
1. Make sure buckets are downloaded to `$EXPORT_DIR/buckets/<bucket-name>/`
2. Or set `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` for direct downloads

### GCS upload fails
1. Check `GOOGLE_APPLICATION_CREDENTIALS` points to a valid service account JSON
2. Ensure service account has `Storage Object Creator` role on the bucket
3. Verify bucket exists: `gsutil ls gs://$GCS_BUCKET`

### User roles defaulting to RECRUITER
Make sure `user_roles.json` exists and is not empty. The transform script will log how many roles it loaded.
