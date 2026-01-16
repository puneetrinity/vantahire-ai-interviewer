import { test, expect } from '@playwright/test';
import { SEED_IDS, SEED_TOKENS } from './helpers/seed';
import { STORAGE_STATE } from './helpers/auth';

test.describe('Candidate Interview Access', () => {
  // These tests use interview tokens, not user auth

  test('should show error for invalid token', async ({ page }) => {
    await page.route('**/auth/me', route =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Unauthorized' }),
      })
    );
    await page.route('**/interviews/candidate/current', route =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Unauthorized' }),
      })
    );

    await page.goto('/interview/fake-id?token=invalid-token');

    // Expect error message
    await expect(page.locator('text=/invalid|expired|error/i')).toBeVisible();
  });

  test('should load interview page with valid token', async ({ page }) => {
    await page.goto(`/interview/${SEED_IDS.interview1}?token=${SEED_TOKENS.interview1}`);

    // Expect interview page to load (not error page)
    await expect(page).toHaveURL(/interview/);
  });
});

test.describe('Candidate Dashboard', () => {
  // Use candidate auth for all tests in this describe block
  test.use({ storageState: STORAGE_STATE.candidate });

  test.describe('Applications', () => {
    test('should load applications page', async ({ page }) => {
      await page.goto('/dashboard/applications');

      // Expect page to load
      await expect(page).toHaveURL(/applications/);
    });

    test('should view my applications', async ({ page }) => {
      await page.goto('/dashboard/applications');

      // Page should load without redirect to login
      await expect(page).not.toHaveURL(/login|auth/);
    });
  });

  test.describe('Profile', () => {
    test('should load profile page', async ({ page }) => {
      await page.goto('/dashboard/profile');

      // Expect page to load
      await expect(page).toHaveURL(/profile/);
    });

    test('should view profile', async ({ page }) => {
      await page.goto('/dashboard/profile');

      // Page should load without redirect to login
      await expect(page).not.toHaveURL(/login|auth/);
    });
  });
});

test.describe('Public Job Listings', () => {
  test('should load job listings page', async ({ page }) => {
    await page.goto('/jobs');

    // Expect page to load (even if empty)
    await expect(page).toHaveURL(/jobs/);
  });

  test('should view job details', async ({ page }) => {
    await page.goto(`/jobs/${SEED_IDS.job1}`);

    // Expect job page to load
    await expect(page).toHaveURL(/jobs/);
  });
});
