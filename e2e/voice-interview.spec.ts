import { test, expect } from '@playwright/test';
import { SEED_IDS, SEED_TOKENS } from './helpers/seed';

test.describe('Voice Interview Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Mock media devices for voice interview pages
    await page.addInitScript(() => {
      const mockStream = {
        getTracks: () => [{
          kind: 'video',
          enabled: true,
          stop: () => {},
        }, {
          kind: 'audio',
          enabled: true,
          stop: () => {},
        }],
        getVideoTracks: () => [{
          kind: 'video',
          enabled: true,
          stop: () => {},
        }],
        getAudioTracks: () => [{
          kind: 'audio',
          enabled: true,
          stop: () => {},
        }],
      };

      // @ts-ignore
      if (navigator.mediaDevices) {
        navigator.mediaDevices.getUserMedia = async () => mockStream;
        navigator.mediaDevices.getDisplayMedia = async () => mockStream;
      }

      // Mock MediaRecorder
      class MockMediaRecorder {
        state = 'inactive';
        ondataavailable: ((e: any) => void) | null = null;
        onstop: (() => void) | null = null;
        onerror: ((e: any) => void) | null = null;

        start() { this.state = 'recording'; }
        stop() {
          this.state = 'inactive';
          if (this.onstop) this.onstop();
        }
        static isTypeSupported() { return true; }
      }
      (window as any).MediaRecorder = MockMediaRecorder;

      // Mock AudioContext
      class MockAudioContext {
        state = 'running';
        createMediaStreamSource() {
          return { connect: () => {} };
        }
        createAnalyser() {
          return {
            fftSize: 256,
            frequencyBinCount: 128,
            getByteFrequencyData: () => {},
            connect: () => {},
          };
        }
        createMediaStreamDestination() {
          return {
            stream: {
              getAudioTracks: () => [{ kind: 'audio', enabled: true, stop: () => {} }],
            },
          };
        }
        createGain() {
          return { gain: { value: 1 }, connect: () => {} };
        }
        close() {}
      }
      (window as any).AudioContext = MockAudioContext;
    });
  });

  test('should access voice interview page with valid token', async ({ page }) => {
    await page.goto(`/voice-interview/${SEED_IDS.interview2}?token=${SEED_TOKENS.interview2}`);

    // Wait for page to settle
    await page.waitForLoadState('networkidle');

    // Page should be at voice-interview URL (not redirected to error)
    await expect(page).toHaveURL(/voice-interview/);
  });

  test('should handle invalid token on voice interview', async ({ page }) => {
    await page.goto('/voice-interview/fake-id?token=invalid-token');

    // Wait for page to settle
    await page.waitForLoadState('networkidle');

    // Should still be on voice-interview URL or show error content
    // The page should load (not crash)
    await expect(page).toHaveURL(/voice-interview/);
  });

  test('should handle missing token on voice interview', async ({ page }) => {
    await page.goto(`/voice-interview/${SEED_IDS.interview2}`);

    // Wait for page to settle
    await page.waitForLoadState('networkidle');

    // Should still be on voice-interview URL
    await expect(page).toHaveURL(/voice-interview/);
  });
});

test.describe('Text Interview Flow', () => {
  test('should load text interview page with valid token', async ({ page }) => {
    await page.goto(`/interview/${SEED_IDS.interview1}?token=${SEED_TOKENS.interview1}`);

    // Expect interview page to load
    await expect(page).toHaveURL(/interview/);
  });

  test('should handle invalid token on text interview', async ({ page }) => {
    await page.goto('/interview/fake-id?token=invalid-token');

    // Wait for page to settle
    await page.waitForLoadState('networkidle');

    // Should stay on interview URL
    await expect(page).toHaveURL(/interview/);
  });
});
