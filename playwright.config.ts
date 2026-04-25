import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for Snitched.ai (Phase 10, plan 10-06).
 *
 * Two projects per D-33:
 *  - mobile-chrome-pixel-7  → 412 × 915 (matches Pixel 7); runs every spec in
 *    tests/e2e/mobile/ — homepage, candidates, officials, profile, juicebox.
 *  - desktop-chrome-1280    → 1280 × 800; runs the visual-regression spec in
 *    tests/e2e/desktop/ to enforce the non-regression guarantee at the
 *    locked-in baseline (D-02, D-35: 1 % diff threshold).
 *
 * Base URL is `process.env.PLAYWRIGHT_BASE_URL` so CI can point the suite at a
 * Vercel preview deployment (D-38). Locally the engineer can point at
 * `http://localhost:3000` after `npm run build && npm start`.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'mobile-chrome-pixel-7',
      use: { ...devices['Pixel 7'], viewport: { width: 412, height: 915 } },
      testMatch: /mobile\/.*\.spec\.ts/,
    },
    {
      name: 'desktop-chrome-1280',
      use: { browserName: 'chromium', viewport: { width: 1280, height: 800 } },
      testMatch: /desktop\/.*\.spec\.ts/,
    },
  ],
});
