import { describe, expect, it } from 'vitest';
import type { ApplicationStatus, InterviewStatus, JobStatus, ApprovalStatus } from '@prisma/client';

// Import shared rules - same rules used by routes
import {
  APPLICATION_TRANSITIONS,
  isValidApplicationTransition,
  canWithdrawApplication,
  canUpdateApplication,
  INTERVIEW_TRANSITIONS,
  isValidInterviewTransition,
  canUpdateInterview,
  JOB_STATUS_TRANSITIONS,
  isValidJobTransition,
  canPublishJob,
} from '../../src/lib/rules/status-transitions.js';

describe('Application Status Transitions', () => {
  describe('From PENDING', () => {
    it('should allow transition to REVIEWED', () => {
      expect(isValidApplicationTransition('PENDING', 'REVIEWED')).toBe(true);
    });

    it('should allow transition to REJECTED', () => {
      expect(isValidApplicationTransition('PENDING', 'REJECTED')).toBe(true);
    });

    it('should NOT allow direct transition to SHORTLISTED', () => {
      expect(isValidApplicationTransition('PENDING', 'SHORTLISTED')).toBe(false);
    });

    it('should NOT allow direct transition to HIRED', () => {
      expect(isValidApplicationTransition('PENDING', 'HIRED')).toBe(false);
    });
  });

  describe('From REVIEWED', () => {
    it('should allow transition to SHORTLISTED', () => {
      expect(isValidApplicationTransition('REVIEWED', 'SHORTLISTED')).toBe(true);
    });

    it('should allow transition to REJECTED', () => {
      expect(isValidApplicationTransition('REVIEWED', 'REJECTED')).toBe(true);
    });

    it('should NOT allow transition back to PENDING', () => {
      expect(isValidApplicationTransition('REVIEWED', 'PENDING')).toBe(false);
    });

    it('should NOT allow direct transition to HIRED', () => {
      expect(isValidApplicationTransition('REVIEWED', 'HIRED')).toBe(false);
    });
  });

  describe('From SHORTLISTED', () => {
    it('should allow transition to HIRED', () => {
      expect(isValidApplicationTransition('SHORTLISTED', 'HIRED')).toBe(true);
    });

    it('should allow transition to REJECTED', () => {
      expect(isValidApplicationTransition('SHORTLISTED', 'REJECTED')).toBe(true);
    });

    it('should NOT allow transition back to REVIEWED', () => {
      expect(isValidApplicationTransition('SHORTLISTED', 'REVIEWED')).toBe(false);
    });
  });

  describe('From REJECTED (Terminal)', () => {
    it('should NOT allow any transition', () => {
      expect(isValidApplicationTransition('REJECTED', 'PENDING')).toBe(false);
      expect(isValidApplicationTransition('REJECTED', 'REVIEWED')).toBe(false);
      expect(isValidApplicationTransition('REJECTED', 'SHORTLISTED')).toBe(false);
      expect(isValidApplicationTransition('REJECTED', 'HIRED')).toBe(false);
    });
  });

  describe('From HIRED (Terminal)', () => {
    it('should NOT allow any transition', () => {
      expect(isValidApplicationTransition('HIRED', 'PENDING')).toBe(false);
      expect(isValidApplicationTransition('HIRED', 'REVIEWED')).toBe(false);
      expect(isValidApplicationTransition('HIRED', 'SHORTLISTED')).toBe(false);
      expect(isValidApplicationTransition('HIRED', 'REJECTED')).toBe(false);
    });
  });

  describe('Application Lifecycle', () => {
    it('should support happy path: PENDING → REVIEWED → SHORTLISTED → HIRED', () => {
      expect(isValidApplicationTransition('PENDING', 'REVIEWED')).toBe(true);
      expect(isValidApplicationTransition('REVIEWED', 'SHORTLISTED')).toBe(true);
      expect(isValidApplicationTransition('SHORTLISTED', 'HIRED')).toBe(true);
    });

    it('should support rejection at any stage', () => {
      expect(isValidApplicationTransition('PENDING', 'REJECTED')).toBe(true);
      expect(isValidApplicationTransition('REVIEWED', 'REJECTED')).toBe(true);
      expect(isValidApplicationTransition('SHORTLISTED', 'REJECTED')).toBe(true);
    });
  });
});

describe('Interview Status Transitions', () => {
  describe('From PENDING', () => {
    it('should allow transition to IN_PROGRESS', () => {
      expect(isValidInterviewTransition('PENDING', 'IN_PROGRESS')).toBe(true);
    });

    it('should allow transition to EXPIRED', () => {
      expect(isValidInterviewTransition('PENDING', 'EXPIRED')).toBe(true);
    });

    it('should NOT allow direct transition to COMPLETED', () => {
      expect(isValidInterviewTransition('PENDING', 'COMPLETED')).toBe(false);
    });
  });

  describe('From IN_PROGRESS', () => {
    it('should allow transition to COMPLETED', () => {
      expect(isValidInterviewTransition('IN_PROGRESS', 'COMPLETED')).toBe(true);
    });

    it('should allow transition to EXPIRED', () => {
      expect(isValidInterviewTransition('IN_PROGRESS', 'EXPIRED')).toBe(true);
    });

    it('should NOT allow transition back to PENDING', () => {
      expect(isValidInterviewTransition('IN_PROGRESS', 'PENDING')).toBe(false);
    });
  });

  describe('From COMPLETED (Terminal)', () => {
    it('should NOT allow any transition', () => {
      expect(isValidInterviewTransition('COMPLETED', 'PENDING')).toBe(false);
      expect(isValidInterviewTransition('COMPLETED', 'IN_PROGRESS')).toBe(false);
      expect(isValidInterviewTransition('COMPLETED', 'EXPIRED')).toBe(false);
    });
  });

  describe('From EXPIRED (Terminal)', () => {
    it('should NOT allow any transition', () => {
      expect(isValidInterviewTransition('EXPIRED', 'PENDING')).toBe(false);
      expect(isValidInterviewTransition('EXPIRED', 'IN_PROGRESS')).toBe(false);
      expect(isValidInterviewTransition('EXPIRED', 'COMPLETED')).toBe(false);
    });
  });

  describe('Interview Lifecycle', () => {
    it('should support happy path: PENDING → IN_PROGRESS → COMPLETED', () => {
      expect(isValidInterviewTransition('PENDING', 'IN_PROGRESS')).toBe(true);
      expect(isValidInterviewTransition('IN_PROGRESS', 'COMPLETED')).toBe(true);
    });

    it('should support expiry flow', () => {
      expect(isValidInterviewTransition('PENDING', 'EXPIRED')).toBe(true);
      expect(isValidInterviewTransition('IN_PROGRESS', 'EXPIRED')).toBe(true);
    });
  });
});

describe('Job Status Transitions', () => {
  describe('From DRAFT', () => {
    it('should allow transition to ACTIVE', () => {
      expect(isValidJobTransition('DRAFT', 'ACTIVE')).toBe(true);
    });

    it('should allow transition to CLOSED', () => {
      expect(isValidJobTransition('DRAFT', 'CLOSED')).toBe(true);
    });
  });

  describe('From ACTIVE', () => {
    it('should allow transition to CLOSED', () => {
      expect(isValidJobTransition('ACTIVE', 'CLOSED')).toBe(true);
    });

    it('should NOT allow transition back to DRAFT', () => {
      expect(isValidJobTransition('ACTIVE', 'DRAFT')).toBe(false);
    });
  });

  describe('From CLOSED', () => {
    it('should allow reopening as DRAFT', () => {
      expect(isValidJobTransition('CLOSED', 'DRAFT')).toBe(true);
    });

    it('should allow reopening as ACTIVE', () => {
      expect(isValidJobTransition('CLOSED', 'ACTIVE')).toBe(true);
    });
  });

  describe('Job Approval Requirement', () => {
    it('should require approval before publishing', () => {
      // Uses shared canPublishJob function
      expect(canPublishJob('DRAFT', 'PENDING')).toBe(false);
    });

    it('should allow publishing when approved', () => {
      expect(canPublishJob('DRAFT', 'APPROVED')).toBe(true);
    });

    it('should NOT allow publishing when rejected', () => {
      expect(canPublishJob('DRAFT', 'REJECTED')).toBe(false);
    });
  });

  describe('Job Lifecycle', () => {
    it('should support workflow: DRAFT → ACTIVE → CLOSED', () => {
      expect(isValidJobTransition('DRAFT', 'ACTIVE')).toBe(true);
      expect(isValidJobTransition('ACTIVE', 'CLOSED')).toBe(true);
    });

    it('should support reopening: CLOSED → DRAFT', () => {
      expect(isValidJobTransition('CLOSED', 'DRAFT')).toBe(true);
    });
  });
});

describe('Candidate Application Update Rules', () => {
  it('should allow update when status is PENDING', () => {
    expect(canUpdateApplication('PENDING')).toBe(true);
  });

  it('should NOT allow update when status is REVIEWED', () => {
    expect(canUpdateApplication('REVIEWED')).toBe(false);
  });

  it('should NOT allow update when status is SHORTLISTED', () => {
    expect(canUpdateApplication('SHORTLISTED')).toBe(false);
  });
});

describe('Application Withdrawal Rules', () => {
  it('should allow withdrawal when PENDING', () => {
    expect(canWithdrawApplication('PENDING')).toBe(true);
  });

  it('should allow withdrawal when REVIEWED', () => {
    expect(canWithdrawApplication('REVIEWED')).toBe(true);
  });

  it('should NOT allow withdrawal when SHORTLISTED', () => {
    expect(canWithdrawApplication('SHORTLISTED')).toBe(false);
  });

  it('should NOT allow withdrawal when HIRED', () => {
    expect(canWithdrawApplication('HIRED')).toBe(false);
  });

  it('should NOT allow withdrawal when REJECTED', () => {
    expect(canWithdrawApplication('REJECTED')).toBe(false);
  });
});

describe('Interview Update Rules', () => {
  it('should allow update when status is PENDING', () => {
    expect(canUpdateInterview('PENDING')).toBe(true);
  });

  it('should NOT allow update when status is IN_PROGRESS', () => {
    expect(canUpdateInterview('IN_PROGRESS')).toBe(false);
  });

  it('should NOT allow update when status is COMPLETED', () => {
    expect(canUpdateInterview('COMPLETED')).toBe(false);
  });
});

describe('Job Publishing Rules', () => {
  it('should allow publishing when approved', () => {
    expect(canPublishJob('DRAFT', 'APPROVED')).toBe(true);
  });

  it('should NOT allow publishing when pending approval', () => {
    expect(canPublishJob('DRAFT', 'PENDING')).toBe(false);
  });

  it('should NOT allow publishing when rejected', () => {
    expect(canPublishJob('DRAFT', 'REJECTED')).toBe(false);
  });

  it('should NOT allow publishing from ACTIVE status', () => {
    expect(canPublishJob('ACTIVE', 'APPROVED')).toBe(false);
  });
});
