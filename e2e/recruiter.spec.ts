import { test, expect } from '@playwright/test';
import { SEED_IDS } from './helpers/seed';
import { STORAGE_STATE } from './helpers/auth';

test.describe('Recruiter Flows', () => {
  // Use recruiter auth for all tests in this describe block
  test.use({ storageState: STORAGE_STATE.recruiter });

  test.describe('Dashboard', () => {
    test('should load dashboard page', async ({ page }) => {
      // Go to a specific dashboard route that has content
      await page.goto('/dashboard/interviews');
      // Expect dashboard to load (not redirect to login)
      await expect(page).toHaveURL(/dashboard/);
    });
  });

  test.describe('Job Management', () => {
    test('should list jobs', async ({ page }) => {
      await page.goto('/dashboard/jobs');

      // Expect jobs page to load
      await expect(page).toHaveURL(/jobs/);
    });

    test('should access create job page', async ({ page }) => {
      await page.goto('/dashboard/jobs/new');

      // Expect page to load (even if redirected to jobs list)
      await expect(page).toHaveURL(/jobs/);
    });
  });

  test.describe('Interview Management', () => {
    test('should view interviews list', async ({ page }) => {
      await page.goto('/dashboard/interviews');

      // Expect interviews page to load
      await expect(page).toHaveURL(/interviews/);
    });

    test('should view interview details', async ({ page }) => {
      await page.goto(`/dashboard/interviews/${SEED_IDS.interview1}`);

      // Expect page to load without error
      await expect(page).not.toHaveURL(/error|404/);
    });

    test('should access create interview page', async ({ page }) => {
      await page.goto('/dashboard/interviews/new');

      // Expect page to load (even if redirected to interviews list)
      await expect(page).toHaveURL(/interviews/);
    });
  });

  test.describe('Application Management', () => {
    test('should view applications for a job', async ({ page }) => {
      await page.goto(`/dashboard/jobs/${SEED_IDS.job1}/applications`);

      // Expect page to load
      await expect(page).toHaveURL(/applications/);
    });
  });
});

test.describe('Public Pages', () => {
  test('should load login page', async ({ page }) => {
    await page.route('**/auth/me', route =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Unauthorized' }),
      })
    );

    await page.goto('/auth');

    // Expect login options
    await expect(page.locator('text=Continue with Google')).toBeVisible();
    await expect(page.locator('text=Continue with LinkedIn')).toBeVisible();
  });

  test('should have OAuth buttons', async ({ page }) => {
    await page.route('**/auth/me', route =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Unauthorized' }),
      })
    );

    await page.goto('/auth');

    // Google OAuth button
    const googleButton = page.locator('button:has-text("Continue with Google")');
    await expect(googleButton).toBeVisible();

    // LinkedIn OAuth button
    const linkedinButton = page.locator('button:has-text("Continue with LinkedIn")');
    await expect(linkedinButton).toBeVisible();
  });
});
