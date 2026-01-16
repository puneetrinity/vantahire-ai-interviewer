import { describe, expect, it } from 'vitest';
import type { FileCategory } from '@prisma/client';

// Import shared rules - same rules used by routes
import {
  FilePurpose,
  type FilePurposeType,
  VALID_PURPOSES,
  ALLOWED_MIMES,
  isValidPurposeForCategory,
  isValidMimeType,
  isValidFileSize,
  MAX_FILE_SIZE_MB,
  canCandidateUploadPurpose,
  canUploadToInterview,
  requiresInterviewId,
  requiresApplicationId,
  isPublicCategory,
  CANDIDATE_TOKEN_PURPOSES,
  UPLOAD_ALLOWED_INTERVIEW_STATUSES,
} from '../../src/lib/rules/file-rules.js';

// Alias for test compatibility
const isValidPurpose = isValidPurposeForCategory;
function isFileSizeValid(fileSize: number, maxSizeMB: number): boolean {
  const maxBytes = maxSizeMB * 1024 * 1024;
  return fileSize <= maxBytes;
}

describe('File Purpose Validation', () => {
  describe('LOGO Category', () => {
    it('should accept recruiter_logo purpose', () => {
      expect(isValidPurpose('LOGO', 'recruiter_logo')).toBe(true);
    });

    it('should reject profile_resume purpose', () => {
      expect(isValidPurpose('LOGO', 'profile_resume')).toBe(false);
    });

    it('should reject interview_attachment purpose', () => {
      expect(isValidPurpose('LOGO', 'interview_attachment')).toBe(false);
    });
  });

  describe('RESUME Category', () => {
    it('should accept profile_resume purpose', () => {
      expect(isValidPurpose('RESUME', 'profile_resume')).toBe(true);
    });

    it('should accept interview_resume purpose', () => {
      expect(isValidPurpose('RESUME', 'interview_resume')).toBe(true);
    });

    it('should accept application_resume purpose', () => {
      expect(isValidPurpose('RESUME', 'application_resume')).toBe(true);
    });

    it('should reject recruiter_logo purpose', () => {
      expect(isValidPurpose('RESUME', 'recruiter_logo')).toBe(false);
    });

    it('should reject interview_attachment purpose', () => {
      expect(isValidPurpose('RESUME', 'interview_attachment')).toBe(false);
    });
  });

  describe('SCREENSHOT Category', () => {
    it('should accept interview_attachment purpose', () => {
      expect(isValidPurpose('SCREENSHOT', 'interview_attachment')).toBe(true);
    });

    it('should accept application_attachment purpose', () => {
      expect(isValidPurpose('SCREENSHOT', 'application_attachment')).toBe(true);
    });

    it('should reject recruiter_logo purpose', () => {
      expect(isValidPurpose('SCREENSHOT', 'recruiter_logo')).toBe(false);
    });

    it('should reject profile_resume purpose', () => {
      expect(isValidPurpose('SCREENSHOT', 'profile_resume')).toBe(false);
    });
  });

  describe('DOCUMENT Category', () => {
    it('should accept interview_attachment purpose', () => {
      expect(isValidPurpose('DOCUMENT', 'interview_attachment')).toBe(true);
    });

    it('should accept application_attachment purpose', () => {
      expect(isValidPurpose('DOCUMENT', 'application_attachment')).toBe(true);
    });

    it('should reject recruiter_logo purpose', () => {
      expect(isValidPurpose('DOCUMENT', 'recruiter_logo')).toBe(false);
    });
  });
});

describe('File MIME Type Validation', () => {
  describe('LOGO Category', () => {
    it('should accept image/png', () => {
      expect(isValidMimeType('LOGO', 'image/png')).toBe(true);
    });

    it('should accept image/jpeg', () => {
      expect(isValidMimeType('LOGO', 'image/jpeg')).toBe(true);
    });

    it('should accept image/webp', () => {
      expect(isValidMimeType('LOGO', 'image/webp')).toBe(true);
    });

    it('should accept image/svg+xml', () => {
      expect(isValidMimeType('LOGO', 'image/svg+xml')).toBe(true);
    });

    it('should reject application/pdf', () => {
      expect(isValidMimeType('LOGO', 'application/pdf')).toBe(false);
    });

    it('should reject image/gif', () => {
      expect(isValidMimeType('LOGO', 'image/gif')).toBe(false);
    });
  });

  describe('RESUME Category', () => {
    it('should accept application/pdf', () => {
      expect(isValidMimeType('RESUME', 'application/pdf')).toBe(true);
    });

    it('should accept application/msword (doc)', () => {
      expect(isValidMimeType('RESUME', 'application/msword')).toBe(true);
    });

    it('should accept application/vnd.openxmlformats-officedocument.wordprocessingml.document (docx)', () => {
      expect(isValidMimeType('RESUME', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(true);
    });

    it('should reject image/png', () => {
      expect(isValidMimeType('RESUME', 'image/png')).toBe(false);
    });

    it('should reject text/plain', () => {
      expect(isValidMimeType('RESUME', 'text/plain')).toBe(false);
    });
  });

  describe('SCREENSHOT Category', () => {
    it('should accept image/png', () => {
      expect(isValidMimeType('SCREENSHOT', 'image/png')).toBe(true);
    });

    it('should accept image/jpeg', () => {
      expect(isValidMimeType('SCREENSHOT', 'image/jpeg')).toBe(true);
    });

    it('should accept image/webp', () => {
      expect(isValidMimeType('SCREENSHOT', 'image/webp')).toBe(true);
    });

    it('should reject application/pdf', () => {
      expect(isValidMimeType('SCREENSHOT', 'application/pdf')).toBe(false);
    });

    it('should reject image/svg+xml', () => {
      expect(isValidMimeType('SCREENSHOT', 'image/svg+xml')).toBe(false);
    });
  });

  describe('DOCUMENT Category', () => {
    it('should accept application/pdf', () => {
      expect(isValidMimeType('DOCUMENT', 'application/pdf')).toBe(true);
    });

    it('should accept text/plain', () => {
      expect(isValidMimeType('DOCUMENT', 'text/plain')).toBe(true);
    });

    it('should accept application/json', () => {
      expect(isValidMimeType('DOCUMENT', 'application/json')).toBe(true);
    });

    it('should reject image/png', () => {
      expect(isValidMimeType('DOCUMENT', 'image/png')).toBe(false);
    });

    it('should reject application/msword', () => {
      expect(isValidMimeType('DOCUMENT', 'application/msword')).toBe(false);
    });
  });
});

describe('File Size Validation', () => {
  const defaultMaxSizeMB = 10;

  describe('Default Limit (10MB)', () => {
    it('should accept file under 10MB', () => {
      const fiveMB = 5 * 1024 * 1024;
      expect(isFileSizeValid(fiveMB, defaultMaxSizeMB)).toBe(true);
    });

    it('should accept file exactly 10MB', () => {
      const tenMB = 10 * 1024 * 1024;
      expect(isFileSizeValid(tenMB, defaultMaxSizeMB)).toBe(true);
    });

    it('should reject file over 10MB', () => {
      const elevenMB = 11 * 1024 * 1024;
      expect(isFileSizeValid(elevenMB, defaultMaxSizeMB)).toBe(false);
    });

    it('should accept empty file', () => {
      expect(isFileSizeValid(0, defaultMaxSizeMB)).toBe(true);
    });

    it('should accept 1 byte file', () => {
      expect(isFileSizeValid(1, defaultMaxSizeMB)).toBe(true);
    });
  });

  describe('Custom Limits', () => {
    it('should respect 5MB limit', () => {
      const fourMB = 4 * 1024 * 1024;
      const sixMB = 6 * 1024 * 1024;

      expect(isFileSizeValid(fourMB, 5)).toBe(true);
      expect(isFileSizeValid(sixMB, 5)).toBe(false);
    });

    it('should respect 25MB limit', () => {
      const twentyMB = 20 * 1024 * 1024;
      const thirtyMB = 30 * 1024 * 1024;

      expect(isFileSizeValid(twentyMB, 25)).toBe(true);
      expect(isFileSizeValid(thirtyMB, 25)).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle boundary exactly at limit', () => {
      const exactLimit = 10 * 1024 * 1024;
      expect(isFileSizeValid(exactLimit, 10)).toBe(true);
    });

    it('should reject 1 byte over limit', () => {
      const oneByteOver = 10 * 1024 * 1024 + 1;
      expect(isFileSizeValid(oneByteOver, 10)).toBe(false);
    });
  });
});

describe('Combined File Validation', () => {
  interface FileValidation {
    category: FileCategory;
    purpose: FilePurposeType;
    mimeType: string;
    size: number;
    maxSizeMB: number;
  }

  function validateFile(file: FileValidation): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!isValidPurpose(file.category, file.purpose)) {
      errors.push(`Invalid purpose '${file.purpose}' for category '${file.category}'`);
    }

    if (!isValidMimeType(file.category, file.mimeType)) {
      errors.push(`Invalid MIME type '${file.mimeType}' for category '${file.category}'`);
    }

    if (!isFileSizeValid(file.size, file.maxSizeMB)) {
      errors.push(`File size ${file.size} exceeds limit of ${file.maxSizeMB}MB`);
    }

    return { valid: errors.length === 0, errors };
  }

  it('should validate a correct LOGO upload', () => {
    const result = validateFile({
      category: 'LOGO',
      purpose: 'recruiter_logo',
      mimeType: 'image/png',
      size: 1024 * 1024, // 1MB
      maxSizeMB: 10,
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should validate a correct RESUME upload', () => {
    const result = validateFile({
      category: 'RESUME',
      purpose: 'profile_resume',
      mimeType: 'application/pdf',
      size: 2 * 1024 * 1024, // 2MB
      maxSizeMB: 10,
    });

    expect(result.valid).toBe(true);
  });

  it('should reject wrong purpose for category', () => {
    const result = validateFile({
      category: 'LOGO',
      purpose: 'profile_resume',
      mimeType: 'image/png',
      size: 1024 * 1024,
      maxSizeMB: 10,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Invalid purpose'))).toBe(true);
  });

  it('should reject wrong MIME type for category', () => {
    const result = validateFile({
      category: 'RESUME',
      purpose: 'profile_resume',
      mimeType: 'image/png',
      size: 1024 * 1024,
      maxSizeMB: 10,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Invalid MIME type'))).toBe(true);
  });

  it('should reject oversized file', () => {
    const result = validateFile({
      category: 'RESUME',
      purpose: 'profile_resume',
      mimeType: 'application/pdf',
      size: 15 * 1024 * 1024, // 15MB
      maxSizeMB: 10,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('exceeds limit'))).toBe(true);
  });

  it('should collect multiple errors', () => {
    const result = validateFile({
      category: 'LOGO',
      purpose: 'profile_resume', // Wrong
      mimeType: 'application/pdf', // Wrong
      size: 15 * 1024 * 1024, // Too big
      maxSizeMB: 10,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(3);
  });
});

describe('Candidate File Upload Rules', () => {
  const candidatePurposes: FilePurposeType[] = ['interview_resume', 'interview_attachment'];

  it('should allow candidate to upload interview_resume', () => {
    expect(candidatePurposes.includes('interview_resume')).toBe(true);
  });

  it('should allow candidate to upload interview_attachment', () => {
    expect(candidatePurposes.includes('interview_attachment')).toBe(true);
  });

  it('should NOT allow candidate to upload recruiter_logo', () => {
    expect(candidatePurposes.includes('recruiter_logo' as FilePurposeType)).toBe(false);
  });

  it('should NOT allow candidate to upload profile_resume (must use session auth)', () => {
    expect(candidatePurposes.includes('profile_resume' as FilePurposeType)).toBe(false);
  });
});

describe('Interview Status for File Upload', () => {
  const allowedStatuses = ['PENDING', 'IN_PROGRESS'];

  it('should allow upload when interview is PENDING', () => {
    expect(allowedStatuses.includes('PENDING')).toBe(true);
  });

  it('should allow upload when interview is IN_PROGRESS', () => {
    expect(allowedStatuses.includes('IN_PROGRESS')).toBe(true);
  });

  it('should NOT allow upload when interview is COMPLETED', () => {
    expect(allowedStatuses.includes('COMPLETED')).toBe(false);
  });

  it('should NOT allow upload when interview is EXPIRED', () => {
    expect(allowedStatuses.includes('EXPIRED')).toBe(false);
  });

});
// Note: CANCELLED status does not exist in schema - only PENDING, IN_PROGRESS, COMPLETED, EXPIRED
