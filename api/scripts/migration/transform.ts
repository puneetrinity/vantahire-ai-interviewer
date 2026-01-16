#!/usr/bin/env npx tsx
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * VantaHire Migration: Transform Supabase Data to Prisma Schema
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Transforms exported Supabase data to match the Railway Prisma schema:
 * - snake_case → camelCase field names
 * - Enum value mapping (if different)
 * - ID preservation (UUIDs stay the same)
 * - Date string → ISO format
 *
 * Usage:
 *   npx tsx scripts/migration/transform.ts --in ./migration_data --out ./migration_data/transformed
 */

import fs from 'fs';
import path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// CLI Args
// ─────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const inputDirIndex = args.indexOf('--in');
const outputDirIndex = args.indexOf('--out');

if (inputDirIndex === -1 || outputDirIndex === -1) {
  console.error('Usage: npx tsx transform.ts --in <input_dir> --out <output_dir>');
  process.exit(1);
}

const INPUT_DIR = args[inputDirIndex + 1];
const OUTPUT_DIR = args[outputDirIndex + 1];

// ─────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────────────────────

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function transformKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = snakeToCamel(key);
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      result[camelKey] = transformKeys(value as Record<string, unknown>);
    } else {
      result[camelKey] = value;
    }
  }
  return result;
}

function readJsonFile(filename: string): unknown[] | null {
  const filepath = path.join(INPUT_DIR, filename);
  if (!fs.existsSync(filepath)) {
    console.warn(`  Warning: ${filename} not found`);
    return null;
  }
  const content = fs.readFileSync(filepath, 'utf-8').trim();
  if (!content || content === 'null') {
    console.warn(`  Warning: ${filename} is empty`);
    return null;
  }
  return JSON.parse(content);
}

function writeJsonFile(filename: string, data: unknown[]): void {
  const filepath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  console.log(`  Wrote ${Array.isArray(data) ? data.length : 0} records to ${filename}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Transform Functions (per model)
// ─────────────────────────────────────────────────────────────────────────────

interface SupabaseUser {
  id: string;
  email: string;
  role?: string;
  full_name?: string;
  avatar_url?: string;
  provider?: string;
  provider_id?: string;
  created_at?: string;
  updated_at?: string;
}

// user_roles table (if roles are stored separately)
interface SupabaseUserRole {
  id?: string;
  user_id: string;
  role: string;
  created_at?: string;
}

function transformUsers(users: SupabaseUser[], userRolesMap: Map<string, string>): unknown[] {
  return users.map((u) => ({
    id: u.id,
    email: u.email,
    // Prefer role from user_roles table, fallback to users.role, then default
    role: mapUserRole(userRolesMap.get(u.id) || u.role),
    provider: u.provider || 'legacy',
    providerId: u.provider_id || u.id, // Fallback to user ID if no provider ID
    fullName: u.full_name || null,
    avatarUrl: u.avatar_url || null,
    createdAt: u.created_at || new Date().toISOString(),
    updatedAt: u.updated_at || new Date().toISOString(),
  }));
}

function mapUserRole(role?: string): string {
  const roleMap: Record<string, string> = {
    recruiter: 'RECRUITER',
    candidate: 'CANDIDATE',
    admin: 'ADMIN',
    RECRUITER: 'RECRUITER',
    CANDIDATE: 'CANDIDATE',
    ADMIN: 'ADMIN',
  };
  return roleMap[role || 'recruiter'] || 'RECRUITER';
}

interface SupabaseProfile {
  id: string;
  user_id: string;
  company_name?: string;
  logo_url?: string;
  logo_file_id?: string;
  brand_color?: string;
  email_intro?: string;
  email_tips?: string;
  email_cta_text?: string;
  subscription_status?: string;
  subscription_updated_at?: string;
  created_at?: string;
  updated_at?: string;
}

function transformRecruiterProfiles(profiles: SupabaseProfile[]): unknown[] {
  return profiles.map((p) => ({
    id: p.id,
    userId: p.user_id,
    companyName: p.company_name || null,
    logoFileId: p.logo_file_id || null,
    brandColor: p.brand_color || null,
    emailIntro: p.email_intro || null,
    emailTips: p.email_tips || null,
    emailCtaText: p.email_cta_text || null,
    subscriptionStatus: mapSubscriptionStatus(p.subscription_status),
    subscriptionUpdatedAt: p.subscription_updated_at || null,
    createdAt: p.created_at || new Date().toISOString(),
    updatedAt: p.updated_at || new Date().toISOString(),
  }));
}

function mapSubscriptionStatus(status?: string): string {
  const statusMap: Record<string, string> = {
    free: 'FREE',
    paid: 'PAID',
    enterprise: 'ENTERPRISE',
    FREE: 'FREE',
    PAID: 'PAID',
    ENTERPRISE: 'ENTERPRISE',
  };
  return statusMap[status || 'free'] || 'FREE';
}

interface SupabaseCandidateProfile {
  id: string;
  user_id: string;
  full_name?: string;
  email?: string;
  phone?: string;
  bio?: string;
  skills?: string[];
  experience_years?: number;
  resume_file_id?: string;
  linkedin_url?: string;
  portfolio_url?: string;
  created_at?: string;
  updated_at?: string;
}

function transformCandidateProfiles(profiles: SupabaseCandidateProfile[]): unknown[] {
  return profiles.map((p) => ({
    id: p.id,
    userId: p.user_id,
    fullName: p.full_name || null,
    email: p.email || null,
    phone: p.phone || null,
    bio: p.bio || null,
    skills: p.skills || [],
    experienceYears: p.experience_years || null,
    resumeFileId: p.resume_file_id || null,
    linkedinUrl: p.linkedin_url || null,
    portfolioUrl: p.portfolio_url || null,
    createdAt: p.created_at || new Date().toISOString(),
    updatedAt: p.updated_at || new Date().toISOString(),
  }));
}

interface SupabaseJob {
  id: string;
  recruiter_id: string;
  title: string;
  description?: string;
  department?: string;
  location?: string;
  job_type?: string;
  salary_range?: string;
  status?: string;
  approval_status?: string;
  approved_at?: string;
  approved_by?: string;
  rejection_reason?: string;
  created_at?: string;
  updated_at?: string;
}

function transformJobs(jobs: SupabaseJob[]): unknown[] {
  return jobs.map((j) => ({
    id: j.id,
    recruiterId: j.recruiter_id,
    title: j.title,
    description: j.description || null,
    department: j.department || null,
    location: j.location || null,
    jobType: j.job_type || null,
    salaryRange: j.salary_range || null,
    status: mapJobStatus(j.status),
    approvalStatus: mapApprovalStatus(j.approval_status),
    approvedAt: j.approved_at || null,
    approvedBy: j.approved_by || null,
    rejectionReason: j.rejection_reason || null,
    createdAt: j.created_at || new Date().toISOString(),
    updatedAt: j.updated_at || new Date().toISOString(),
  }));
}

function mapJobStatus(status?: string): string {
  const statusMap: Record<string, string> = {
    draft: 'DRAFT',
    active: 'ACTIVE',
    closed: 'CLOSED',
    DRAFT: 'DRAFT',
    ACTIVE: 'ACTIVE',
    CLOSED: 'CLOSED',
  };
  return statusMap[status || 'draft'] || 'DRAFT';
}

function mapApprovalStatus(status?: string): string {
  const statusMap: Record<string, string> = {
    pending: 'PENDING',
    approved: 'APPROVED',
    rejected: 'REJECTED',
    PENDING: 'PENDING',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
  };
  return statusMap[status || 'pending'] || 'PENDING';
}

interface SupabaseInterview {
  id: string;
  recruiter_id: string;
  job_id?: string;
  candidate_email: string;
  candidate_name?: string;
  candidate_notes?: string;
  candidate_resume_file_id?: string;
  candidate_user_id?: string;
  job_role: string;
  type?: string;
  time_limit_minutes?: number;
  status?: string;
  interview_url?: string;
  expires_at?: string;
  started_at?: string;
  completed_at?: string;
  score?: number;
  transcript_summary?: string;
  recording_gcs_key?: string;
  created_at?: string;
  updated_at?: string;
}

function transformInterviews(interviews: SupabaseInterview[]): unknown[] {
  return interviews.map((i) => ({
    id: i.id,
    recruiterId: i.recruiter_id,
    jobId: i.job_id || null,
    candidateEmail: i.candidate_email,
    candidateName: i.candidate_name || null,
    candidateNotes: i.candidate_notes || null,
    candidateResumeFileId: i.candidate_resume_file_id || null,
    candidateUserId: i.candidate_user_id || null,
    jobRole: i.job_role,
    type: mapInterviewType(i.type),
    timeLimitMinutes: i.time_limit_minutes || 30,
    status: mapInterviewStatus(i.status),
    interviewUrl: i.interview_url || null,
    expiresAt: i.expires_at || null,
    startedAt: i.started_at || null,
    completedAt: i.completed_at || null,
    score: i.score || null,
    transcriptSummary: i.transcript_summary || null,
    recordingGcsKey: i.recording_gcs_key || null,
    createdAt: i.created_at || new Date().toISOString(),
    updatedAt: i.updated_at || new Date().toISOString(),
  }));
}

function mapInterviewType(type?: string): string {
  const typeMap: Record<string, string> = {
    text: 'TEXT',
    voice: 'VOICE',
    TEXT: 'TEXT',
    VOICE: 'VOICE',
  };
  return typeMap[type || 'text'] || 'TEXT';
}

function mapInterviewStatus(status?: string): string {
  const statusMap: Record<string, string> = {
    pending: 'PENDING',
    in_progress: 'IN_PROGRESS',
    completed: 'COMPLETED',
    expired: 'EXPIRED',
    PENDING: 'PENDING',
    IN_PROGRESS: 'IN_PROGRESS',
    COMPLETED: 'COMPLETED',
    EXPIRED: 'EXPIRED',
  };
  return statusMap[status || 'pending'] || 'PENDING';
}

interface SupabaseInterviewMessage {
  id: string;
  interview_id: string;
  role: string;
  content: string;
  created_at?: string;
}

function transformInterviewMessages(messages: SupabaseInterviewMessage[]): unknown[] {
  return messages.map((m) => ({
    id: m.id,
    interviewId: m.interview_id,
    role: m.role,
    content: m.content,
    createdAt: m.created_at || new Date().toISOString(),
  }));
}

interface SupabaseJobApplication {
  id: string;
  job_id: string;
  candidate_id: string;
  cover_letter?: string;
  resume_file_id?: string;
  notes?: string;
  status?: string;
  reviewed_at?: string;
  applied_at?: string;
  updated_at?: string;
}

function transformJobApplications(applications: SupabaseJobApplication[]): unknown[] {
  return applications.map((a) => ({
    id: a.id,
    jobId: a.job_id,
    candidateId: a.candidate_id,
    coverLetter: a.cover_letter || null,
    resumeFileId: a.resume_file_id || null,
    notes: a.notes || null,
    status: mapApplicationStatus(a.status),
    reviewedAt: a.reviewed_at || null,
    appliedAt: a.applied_at || new Date().toISOString(),
    updatedAt: a.updated_at || new Date().toISOString(),
  }));
}

function mapApplicationStatus(status?: string): string {
  const statusMap: Record<string, string> = {
    pending: 'PENDING',
    reviewed: 'REVIEWED',
    shortlisted: 'SHORTLISTED',
    rejected: 'REJECTED',
    hired: 'HIRED',
    PENDING: 'PENDING',
    REVIEWED: 'REVIEWED',
    SHORTLISTED: 'SHORTLISTED',
    REJECTED: 'REJECTED',
    HIRED: 'HIRED',
  };
  return statusMap[status || 'pending'] || 'PENDING';
}

interface SupabaseEmailMessage {
  id: string;
  interview_id: string;
  recipient_email: string;
  message_id?: string;
  status?: string;
  sent_at?: string;
  delivered_at?: string;
  opened_at?: string;
  bounced_at?: string;
  failed_at?: string;
  error_message?: string;
  created_at?: string;
  updated_at?: string;
}

function transformEmailMessages(messages: SupabaseEmailMessage[]): unknown[] {
  return messages.map((m) => ({
    id: m.id,
    interviewId: m.interview_id,
    recipientEmail: m.recipient_email,
    messageId: m.message_id || null,
    status: m.status || 'pending',
    sentAt: m.sent_at || null,
    deliveredAt: m.delivered_at || null,
    openedAt: m.opened_at || null,
    bouncedAt: m.bounced_at || null,
    failedAt: m.failed_at || null,
    errorMessage: m.error_message || null,
    createdAt: m.created_at || new Date().toISOString(),
    updatedAt: m.updated_at || new Date().toISOString(),
  }));
}

interface SupabaseWhatsAppMessage {
  id: string;
  interview_id: string;
  candidate_phone: string;
  message_id?: string;
  status?: string;
  sent_at?: string;
  delivered_at?: string;
  read_at?: string;
  failed_at?: string;
  error_message?: string;
  created_at?: string;
  updated_at?: string;
}

function transformWhatsAppMessages(messages: SupabaseWhatsAppMessage[]): unknown[] {
  return messages.map((m) => ({
    id: m.id,
    interviewId: m.interview_id,
    candidatePhone: m.candidate_phone,
    messageId: m.message_id || null,
    status: m.status || 'pending',
    sentAt: m.sent_at || null,
    deliveredAt: m.delivered_at || null,
    readAt: m.read_at || null,
    failedAt: m.failed_at || null,
    errorMessage: m.error_message || null,
    createdAt: m.created_at || new Date().toISOString(),
    updatedAt: m.updated_at || new Date().toISOString(),
  }));
}

// Generic transform for remaining tables
function transformGeneric(records: Record<string, unknown>[]): unknown[] {
  return records.map(transformKeys);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== VantaHire Migration: Transform ===');
  console.log(`Input:  ${INPUT_DIR}`);
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log('');

  // Create output directory
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Transform each table
  console.log('Transforming tables...');

  // Build user_roles map (user_id -> role)
  const userRoles = readJsonFile('user_roles.json') as SupabaseUserRole[] | null;
  const userRolesMap = new Map<string, string>();
  if (userRoles) {
    for (const ur of userRoles) {
      userRolesMap.set(ur.user_id, ur.role);
    }
    console.log(`  Loaded ${userRolesMap.size} user roles from user_roles.json`);
  }

  // Users (merge with user_roles)
  const users = readJsonFile('users.json') as SupabaseUser[] | null;
  if (users) writeJsonFile('User.json', transformUsers(users, userRolesMap));

  // Recruiter Profiles
  const profiles = readJsonFile('profiles.json') as SupabaseProfile[] | null;
  if (profiles) writeJsonFile('RecruiterProfile.json', transformRecruiterProfiles(profiles));

  // Candidate Profiles
  const candidateProfiles = readJsonFile('candidate_profiles.json') as SupabaseCandidateProfile[] | null;
  if (candidateProfiles) writeJsonFile('CandidateProfile.json', transformCandidateProfiles(candidateProfiles));

  // Jobs
  const jobs = readJsonFile('jobs.json') as SupabaseJob[] | null;
  if (jobs) writeJsonFile('Job.json', transformJobs(jobs));

  // Interviews
  const interviews = readJsonFile('interviews.json') as SupabaseInterview[] | null;
  if (interviews) writeJsonFile('Interview.json', transformInterviews(interviews));

  // Interview Messages
  const interviewMessages = readJsonFile('interview_messages.json') as SupabaseInterviewMessage[] | null;
  if (interviewMessages) writeJsonFile('InterviewMessage.json', transformInterviewMessages(interviewMessages));

  // Job Applications
  const jobApplications = readJsonFile('job_applications.json') as SupabaseJobApplication[] | null;
  if (jobApplications) writeJsonFile('JobApplication.json', transformJobApplications(jobApplications));

  // Email Messages
  const emailMessages = readJsonFile('email_messages.json') as SupabaseEmailMessage[] | null;
  if (emailMessages) writeJsonFile('EmailMessage.json', transformEmailMessages(emailMessages));

  // WhatsApp Messages
  const whatsappMessages = readJsonFile('whatsapp_messages.json') as SupabaseWhatsAppMessage[] | null;
  if (whatsappMessages) writeJsonFile('WhatsAppMessage.json', transformWhatsAppMessages(whatsappMessages));

  // API Keys
  const apiKeys = readJsonFile('api_keys.json') as Record<string, unknown>[] | null;
  if (apiKeys) writeJsonFile('ApiKey.json', transformGeneric(apiKeys));

  // API Usage Logs
  const apiUsageLogs = readJsonFile('api_usage_logs.json') as Record<string, unknown>[] | null;
  if (apiUsageLogs) writeJsonFile('ApiUsageLog.json', transformGeneric(apiUsageLogs));

  // Admin Settings
  const adminSettings = readJsonFile('admin_settings.json') as Record<string, unknown>[] | null;
  if (adminSettings) writeJsonFile('AdminSettings.json', transformGeneric(adminSettings));

  // Onboarding Reminders
  const onboardingReminders = readJsonFile('onboarding_reminders.json') as Record<string, unknown>[] | null;
  if (onboardingReminders) writeJsonFile('OnboardingReminder.json', transformGeneric(onboardingReminders));

  console.log('');
  console.log('=== Transform Complete ===');
  console.log('');
  console.log('Next steps:');
  console.log(`  npx tsx scripts/migration/import.ts --in ${OUTPUT_DIR}`);
}

main().catch((err) => {
  console.error('Transform failed:', err);
  process.exit(1);
});
