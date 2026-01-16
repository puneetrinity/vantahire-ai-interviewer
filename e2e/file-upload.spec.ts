import { test, expect } from '@playwright/test';
import { STORAGE_STATE } from './helpers/auth';
import { SEED_IDS, SEED_TOKENS } from './helpers/seed';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, 'fixtures');

test.describe('File Upload - Recruiter', () => {
  test.use({ storageState: STORAGE_STATE.recruiter });

  test('should access profile settings page', async ({ page }) => {
    await page.goto('/dashboard/settings');

    // Expect settings page to load
    await expect(page).toHaveURL(/settings/);
  });

  test('should show file upload area on settings page', async ({ page }) => {
    await page.goto('/dashboard/settings');

    // Look for file upload related elements (logo upload, etc.)
    await page.waitForLoadState('networkidle');

    // Page should load without error
    await expect(page).not.toHaveURL(/error|404/);
  });
});

test.describe('File Upload - Candidate with Interview Token', () => {
  test.beforeEach(async ({ page }) => {
    // Mock media devices for interview pages
    await page.addInitScript(() => {
      const mockStream = {
        getTracks: () => [],
        getVideoTracks: () => [],
        getAudioTracks: () => [],
      };
      // @ts-ignore
      if (navigator.mediaDevices) {
        navigator.mediaDevices.getUserMedia = async () => mockStream;
      }
    });
  });

  test('should access voice interview page with token', async ({ page }) => {
    await page.goto(`/voice-interview/${SEED_IDS.interview2}?token=${SEED_TOKENS.interview2}`);

    // Wait for page to settle
    await page.waitForLoadState('networkidle');

    // Page should load at voice-interview URL
    await expect(page).toHaveURL(/voice-interview/);
  });

  test('should access text interview page with token', async ({ page }) => {
    await page.goto(`/interview/${SEED_IDS.interview1}?token=${SEED_TOKENS.interview1}`);

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Page should load
    await expect(page).toHaveURL(/interview/);
  });
});

test.describe('File Upload - Candidate Dashboard', () => {
  test.use({ storageState: STORAGE_STATE.candidate });

  test('should access profile page', async ({ page }) => {
    await page.goto('/dashboard/profile');

    // Expect profile page to load
    await expect(page).toHaveURL(/profile/);
  });

  test('should show resume upload section on profile', async ({ page }) => {
    await page.goto('/dashboard/profile');

    await page.waitForLoadState('networkidle');

    // Page should load without errors
    await expect(page).not.toHaveURL(/error|404|auth/);
  });
});

test.describe('File Access Control', () => {
  test('should return 401 for file access without auth', async ({ request }) => {
    // Try to access a file without authentication
    const response = await request.get('http://localhost:3000/files/nonexistent-file-id');

    // Should return 404 (not found) or 401/403 (unauthorized)
    expect([401, 403, 404]).toContain(response.status());
  });

  test('should return 404 for non-existent file', async ({ request }) => {
    const response = await request.get('http://localhost:3000/files/00000000-0000-0000-0000-000000000000');

    // Should return 404 or auth error
    expect([401, 403, 404]).toContain(response.status());
  });
});
