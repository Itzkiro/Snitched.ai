import { test, expect } from '@playwright/test';

/**
 * Desktop visual-regression spec at 1280 × 800 (D-35).
 *
 * Snapshots the 5 core pages and fails if visual diff > 1 % (maxDiffPixelRatio:
 * 0.01). Baseline images are stored under
 * tests/e2e/desktop/visual-regression.spec.ts-snapshots/. The first run
 * generates baselines; subsequent runs compare. Use
 * `npx playwright test --update-snapshots` to refresh after intentional
 * changes (D-02 non-regression guard requires human review on diff > 1 %).
 *
 * TEST_POLITICIAN_ID overridable via env var (defaults to a known-stable
 * fixture from the seeded data set).
 */
const PAGES = [
  { path: '/', name: 'home' },
  { path: '/candidates', name: 'candidates' },
  { path: '/officials', name: 'officials' },
  { path: '/juicebox', name: 'juicebox' },
  {
    path: `/politician/${process.env.TEST_POLITICIAN_ID || 'fl-house-2026-aaron-baker'}`,
    name: 'profile',
  },
];

for (const p of PAGES) {
  test(`desktop visual regression: ${p.name}`, async ({ page }) => {
    await page.goto(p.path);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot(`${p.name}-desktop-1280.png`, {
      maxDiffPixelRatio: 0.01,
    });
  });
}
