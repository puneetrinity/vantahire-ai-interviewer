#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# VantaHire Migration: Export from Supabase
# ═══════════════════════════════════════════════════════════════════════════
# Usage:
#   export SUPABASE_DB_URL="postgres://..."
#   ./export.sh
# ═══════════════════════════════════════════════════════════════════════════

set -e

# Configuration
EXPORT_DIR="${EXPORT_DIR:-./migration_data}"
SUPABASE_DB_URL="${SUPABASE_DB_URL:?SUPABASE_DB_URL is required}"

echo "=== VantaHire Migration: Export ==="
echo "Export directory: $EXPORT_DIR"

mkdir -p "$EXPORT_DIR"

# ─────────────────────────────────────────────────────────────────────────────
# 1) Export tables as SQL (data only)
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "Step 1: Exporting tables..."

pg_dump "$SUPABASE_DB_URL" \
  --data-only \
  --column-inserts \
  --rows-per-insert=1000 \
  --table=public.users \
  --table=public.user_roles \
  --table=public.profiles \
  --table=public.candidate_profiles \
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
  > "$EXPORT_DIR/supabase_data.sql" 2>/dev/null || {
    echo "Warning: Some tables may not exist. Attempting individual exports..."
}

# ─────────────────────────────────────────────────────────────────────────────
# 2) Export individual tables as JSON (more reliable)
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "Step 2: Exporting tables as JSON..."

# Function to export table to JSON
export_table_json() {
  local table=$1
  local output="$EXPORT_DIR/${table}.json"
  echo "  Exporting $table..."

  psql "$SUPABASE_DB_URL" -t -A -c "
    SELECT json_agg(t) FROM public.${table} t;
  " > "$output" 2>/dev/null || echo "  Warning: Table $table not found or empty"
}

# Export each table
export_table_json "users"
export_table_json "user_roles"
export_table_json "profiles"
export_table_json "candidate_profiles"
export_table_json "jobs"
export_table_json "interviews"
export_table_json "interview_messages"
export_table_json "job_applications"
export_table_json "email_messages"
export_table_json "whatsapp_messages"
export_table_json "api_keys"
export_table_json "api_usage_logs"
export_table_json "admin_settings"
export_table_json "onboarding_reminders"

# ─────────────────────────────────────────────────────────────────────────────
# 3) Export file references (storage bucket metadata)
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "Step 3: Exporting storage bucket metadata..."

# Note: Actual file data needs to be downloaded via Supabase CLI or S3 tools
psql "$SUPABASE_DB_URL" -t -A -c "
  SELECT json_agg(t) FROM storage.objects t;
" > "$EXPORT_DIR/storage_objects.json" 2>/dev/null || echo "  Warning: storage.objects not accessible"

# ─────────────────────────────────────────────────────────────────────────────
# 4) Generate row counts for verification
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "Step 4: Generating row counts..."

{
  echo "=== Supabase Table Row Counts ==="
  echo "Exported at: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo ""

  for table in users user_roles profiles candidate_profiles jobs interviews interview_messages job_applications email_messages whatsapp_messages api_keys api_usage_logs admin_settings onboarding_reminders; do
    count=$(psql "$SUPABASE_DB_URL" -t -A -c "SELECT count(*) FROM public.${table};" 2>/dev/null || echo "N/A")
    printf "%-25s %s\n" "$table:" "$count"
  done
} > "$EXPORT_DIR/row_counts.txt"

cat "$EXPORT_DIR/row_counts.txt"

# ─────────────────────────────────────────────────────────────────────────────
# Done
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "=== Export Complete ==="
echo "Files written to: $EXPORT_DIR"
echo ""
echo "Next steps:"
echo "  1. Download storage bucket files using Supabase CLI:"
echo "     supabase storage download -b company-logos -o $EXPORT_DIR/buckets/company-logos"
echo "     supabase storage download -b interview-documents -o $EXPORT_DIR/buckets/interview-documents"
echo "     supabase storage download -b resumes -o $EXPORT_DIR/buckets/resumes"
echo "     supabase storage download -b recordings -o $EXPORT_DIR/buckets/recordings"
echo ""
echo "  2. Run transformation:"
echo "     npx tsx scripts/migration/transform.ts --in $EXPORT_DIR --out $EXPORT_DIR/transformed"
