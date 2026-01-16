/**
 * File Validation Rules
 *
 * Shared between routes and tests to ensure consistent business logic.
 */

import type { FileCategory, InterviewStatus } from '@prisma/client';

// ─────────────────────────────────────────────────────────────────
// File Purposes
// ─────────────────────────────────────────────────────────────────

export const FilePurpose = {
  RECRUITER_LOGO: 'recruiter_logo',           // → RecruiterProfile.logoFileId
  PROFILE_RESUME: 'profile_resume',           // → CandidateProfile.resumeFileId
  INTERVIEW_RESUME: 'interview_resume',       // → Interview.candidateResumeFileId
  APPLICATION_RESUME: 'application_resume',   // → JobApplication.resumeFileId
  INTERVIEW_ATTACHMENT: 'interview_attachment', // → File.interviewId only
  APPLICATION_ATTACHMENT: 'application_attachment', // → File.jobApplicationId only
} as const;

export type FilePurposeType = typeof FilePurpose[keyof typeof FilePurpose];

// ─────────────────────────────────────────────────────────────────
// Purpose-Category Validation
// ─────────────────────────────────────────────────────────────────

export const VALID_PURPOSES: Record<FileCategory, FilePurposeType[]> = {
  LOGO: ['recruiter_logo'],
  RESUME: ['profile_resume', 'interview_resume', 'application_resume'],
  SCREENSHOT: ['interview_attachment', 'application_attachment'],
  DOCUMENT: ['interview_attachment', 'application_attachment'],
};

export function isValidPurposeForCategory(category: FileCategory, purpose: FilePurposeType): boolean {
  return VALID_PURPOSES[category].includes(purpose);
}

// ─────────────────────────────────────────────────────────────────
// MIME Type Validation
// ─────────────────────────────────────────────────────────────────

export const ALLOWED_MIMES: Record<FileCategory, string[]> = {
  LOGO: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'],
  RESUME: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  SCREENSHOT: ['image/png', 'image/jpeg', 'image/webp'],
  DOCUMENT: [
    'application/pdf',
    'text/plain',
    'application/json',
  ],
};

export function isValidMimeType(category: FileCategory, mimeType: string): boolean {
  return ALLOWED_MIMES[category].includes(mimeType);
}

// ─────────────────────────────────────────────────────────────────
// File Size Limits (in bytes)
// ─────────────────────────────────────────────────────────────────

export const MAX_FILE_SIZE_MB = 10;
export const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;

export function isValidFileSize(sizeInBytes: number): boolean {
  return sizeInBytes > 0 && sizeInBytes <= MAX_FILE_SIZE;
}

// ─────────────────────────────────────────────────────────────────
// Upload Authorization Rules
// ─────────────────────────────────────────────────────────────────

/**
 * Purposes allowed for candidates uploading via interview token
 */
export const CANDIDATE_TOKEN_PURPOSES: FilePurposeType[] = [
  'interview_resume',
  'interview_attachment',
];

export function canCandidateUploadPurpose(purpose: FilePurposeType): boolean {
  return CANDIDATE_TOKEN_PURPOSES.includes(purpose);
}

/**
 * Interview statuses that allow file uploads
 */
export const UPLOAD_ALLOWED_INTERVIEW_STATUSES: InterviewStatus[] = ['PENDING', 'IN_PROGRESS'];

export function canUploadToInterview(status: InterviewStatus): boolean {
  return UPLOAD_ALLOWED_INTERVIEW_STATUSES.includes(status);
}

/**
 * Purposes that require an interviewId
 */
export const PURPOSES_REQUIRING_INTERVIEW_ID: FilePurposeType[] = [
  'interview_resume',
  'interview_attachment',
];

export function requiresInterviewId(purpose: FilePurposeType): boolean {
  return PURPOSES_REQUIRING_INTERVIEW_ID.includes(purpose);
}

/**
 * Purposes that require a jobApplicationId
 */
export const PURPOSES_REQUIRING_APPLICATION_ID: FilePurposeType[] = [
  'application_resume',
  'application_attachment',
];

export function requiresApplicationId(purpose: FilePurposeType): boolean {
  return PURPOSES_REQUIRING_APPLICATION_ID.includes(purpose);
}

// ─────────────────────────────────────────────────────────────────
// Access Rules
// ─────────────────────────────────────────────────────────────────

/**
 * Categories that are publicly accessible (no auth required)
 */
export const PUBLIC_CATEGORIES: FileCategory[] = ['LOGO'];

export function isPublicCategory(category: FileCategory): boolean {
  return PUBLIC_CATEGORIES.includes(category);
}
