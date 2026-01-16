/**
 * Status Transition Rules
 *
 * Shared between routes and tests to ensure consistent business logic.
 */

import type { ApplicationStatus, InterviewStatus, JobStatus, ApprovalStatus } from '@prisma/client';

// ─────────────────────────────────────────────────────────────────
// Application Status Transitions
// ─────────────────────────────────────────────────────────────────

export const APPLICATION_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  PENDING: ['REVIEWED', 'REJECTED'],
  REVIEWED: ['SHORTLISTED', 'REJECTED'],
  SHORTLISTED: ['HIRED', 'REJECTED'],
  REJECTED: [], // Terminal state
  HIRED: [],    // Terminal state
};

export function isValidApplicationTransition(from: ApplicationStatus, to: ApplicationStatus): boolean {
  return APPLICATION_TRANSITIONS[from].includes(to);
}

export function canWithdrawApplication(status: ApplicationStatus): boolean {
  return ['PENDING', 'REVIEWED'].includes(status);
}

export function canUpdateApplication(status: ApplicationStatus): boolean {
  return status === 'PENDING';
}

// ─────────────────────────────────────────────────────────────────
// Interview Status Transitions
// ─────────────────────────────────────────────────────────────────

export const INTERVIEW_TRANSITIONS: Record<InterviewStatus, InterviewStatus[]> = {
  PENDING: ['IN_PROGRESS', 'EXPIRED'],
  IN_PROGRESS: ['COMPLETED', 'EXPIRED'],
  COMPLETED: [], // Terminal state
  EXPIRED: [],   // Terminal state
};

export function isValidInterviewTransition(from: InterviewStatus, to: InterviewStatus): boolean {
  return INTERVIEW_TRANSITIONS[from].includes(to);
}

export function canUpdateInterview(status: InterviewStatus): boolean {
  return status === 'PENDING';
}

export function canStartInterview(status: InterviewStatus): boolean {
  return status === 'PENDING';
}

export function canCompleteInterview(status: InterviewStatus): boolean {
  return status === 'IN_PROGRESS';
}

export function isActiveInterview(status: InterviewStatus): boolean {
  return ['PENDING', 'IN_PROGRESS'].includes(status);
}

// ─────────────────────────────────────────────────────────────────
// Job Status Transitions
// ─────────────────────────────────────────────────────────────────

export const JOB_STATUS_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  DRAFT: ['ACTIVE', 'CLOSED'],
  ACTIVE: ['CLOSED'],
  CLOSED: ['DRAFT', 'ACTIVE'], // Can reopen
};

export function isValidJobTransition(from: JobStatus, to: JobStatus): boolean {
  return JOB_STATUS_TRANSITIONS[from].includes(to);
}

export function canPublishJob(status: JobStatus, approvalStatus: ApprovalStatus): boolean {
  return status === 'DRAFT' && approvalStatus === 'APPROVED';
}

export function requiresApprovalToPublish(status: JobStatus, targetStatus: JobStatus): boolean {
  return status === 'DRAFT' && targetStatus === 'ACTIVE';
}
