/**
 * DB Integration Tests: Files
 *
 * Run with: npm run test:db
 * Requires: DATABASE_URL and seeded database
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { prisma, TEST_IDS, setupDbTests, teardownDbTests } from './setup.js';

describe('Files DB Integration', () => {
  beforeAll(async () => {
    await setupDbTests();
  });

  afterAll(async () => {
    await teardownDbTests();
  });

  describe('File Queries', () => {
    it('should find file by id', async () => {
      const file = await prisma.file.findUnique({
        where: { id: TEST_IDS.file1 },
      });

      expect(file).not.toBeNull();
      expect(file?.name).toBeTruthy();
      expect(file?.mimeType).toBeTruthy();
    });

    it('should filter files by category', async () => {
      const resumeFiles = await prisma.file.findMany({
        where: { category: 'RESUME' },
      });

      expect(resumeFiles.every(f => f.category === 'RESUME')).toBe(true);
    });

    it('should filter files by uploader', async () => {
      const userFiles = await prisma.file.findMany({
        where: { uploadedBy: TEST_IDS.recruiter },
      });

      expect(userFiles.every(f => f.uploadedBy === TEST_IDS.recruiter)).toBe(true);
    });

    it('should include user relation', async () => {
      const file = await prisma.file.findFirst({
        where: { uploadedBy: { not: null } },
        include: { user: true },
      });

      if (file) {
        expect(file.user).not.toBeNull();
        expect(file.user?.email).toBeTruthy();
      }
    });
  });

  describe('File CRUD', () => {
    const tempFileId = '00000000-0000-4000-8000-000000009992';

    afterAll(async () => {
      await prisma.file.deleteMany({ where: { id: tempFileId } });
    });

    it('should create a resume file', async () => {
      const testData = Buffer.from('Test resume content');

      const file = await prisma.file.create({
        data: {
          id: tempFileId,
          name: 'test-resume.pdf',
          mimeType: 'application/pdf',
          size: testData.length,
          category: 'RESUME',
          uploadedBy: TEST_IDS.candidate,
          data: testData,
        },
      });

      expect(file.id).toBe(tempFileId);
      expect(file.name).toBe('test-resume.pdf');
      expect(file.category).toBe('RESUME');
      expect(file.size).toBe(testData.length);
    });

    it('should retrieve file data', async () => {
      const file = await prisma.file.findUnique({
        where: { id: tempFileId },
      });

      expect(file).not.toBeNull();
      // Prisma returns Uint8Array for binary data
      expect(file?.data).toBeInstanceOf(Uint8Array);
      expect(Buffer.from(file!.data).toString()).toBe('Test resume content');
    });

    it('should create a logo file', async () => {
      const logoId = '00000000-0000-4000-8000-000000009993';
      const logoData = Buffer.from('PNG image data');

      const file = await prisma.file.create({
        data: {
          id: logoId,
          name: 'company-logo.png',
          mimeType: 'image/png',
          size: logoData.length,
          category: 'LOGO',
          uploadedBy: TEST_IDS.recruiter,
          data: logoData,
        },
      });

      expect(file.category).toBe('LOGO');

      // Cleanup
      await prisma.file.delete({ where: { id: logoId } });
    });

    it('should create a screenshot file', async () => {
      const screenshotId = '00000000-0000-4000-8000-000000009994';
      const screenshotData = Buffer.from('Screenshot data');

      const file = await prisma.file.create({
        data: {
          id: screenshotId,
          name: 'interview-screenshot.jpg',
          mimeType: 'image/jpeg',
          size: screenshotData.length,
          category: 'SCREENSHOT',
          interviewId: TEST_IDS.interview1,
          data: screenshotData,
        },
      });

      expect(file.category).toBe('SCREENSHOT');
      expect(file.interviewId).toBe(TEST_IDS.interview1);

      // Cleanup
      await prisma.file.delete({ where: { id: screenshotId } });
    });

    it('should create a document file for application', async () => {
      const docId = '00000000-0000-4000-8000-000000009995';
      const docData = Buffer.from('Document content');

      const file = await prisma.file.create({
        data: {
          id: docId,
          name: 'cover-letter.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: docData.length,
          category: 'DOCUMENT',
          jobApplicationId: TEST_IDS.application1,
          data: docData,
        },
      });

      expect(file.category).toBe('DOCUMENT');
      expect(file.jobApplicationId).toBe(TEST_IDS.application1);

      // Cleanup
      await prisma.file.delete({ where: { id: docId } });
    });

    it('should delete file', async () => {
      await prisma.file.delete({
        where: { id: tempFileId },
      });

      const deleted = await prisma.file.findUnique({
        where: { id: tempFileId },
      });

      expect(deleted).toBeNull();
    });
  });

  describe('File Relations', () => {
    it('should get files for interview', async () => {
      const interview = await prisma.interview.findUnique({
        where: { id: TEST_IDS.interview1 },
        include: { files: true },
      });

      expect(interview).not.toBeNull();
      // Files array exists (may be empty)
      expect(Array.isArray(interview?.files)).toBe(true);
    });

    it('should get files for application', async () => {
      const application = await prisma.jobApplication.findUnique({
        where: { id: TEST_IDS.application1 },
        include: { files: true, resumeFile: true },
      });

      expect(application).not.toBeNull();
      expect(Array.isArray(application?.files)).toBe(true);
    });
  });

  describe('File Aggregations', () => {
    it('should count files by category', async () => {
      const counts = await prisma.file.groupBy({
        by: ['category'],
        _count: true,
      });

      // Should have at least one category
      expect(Array.isArray(counts)).toBe(true);
    });

    it('should sum file sizes by category', async () => {
      const sizes = await prisma.file.groupBy({
        by: ['category'],
        _sum: { size: true },
      });

      expect(Array.isArray(sizes)).toBe(true);
    });
  });
});
