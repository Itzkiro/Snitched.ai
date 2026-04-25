import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * /juicebox mobile spec (412 × 915 viewport).
 *
 * Per D-34: three card-stack sections render at base; no horizontal page
 * scroll. Uses the [data-leaderboard-mobile] hook added in plan 10-04 (the
 * lg:hidden card-stack wrapper inside Leaderboard.tsx).
 */
test('juicebox: three card-stack sections render at base', async ({ page }) => {
  await page.goto('/juicebox');
  const stacks = page.locator('[data-leaderboard-mobile]');
  expect(await stacks.count()).toBeGreaterThanOrEqual(3);
});

test('juicebox: no horizontal page scroll', async ({ page }) => {
  await page.goto('/juicebox');
  const horizontal = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth
  );
  expect(horizontal).toBe(true);
});

test('juicebox: no a11y critical/serious', async ({ page }) => {
  await page.goto('/juicebox');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const critical = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious'
  );
  expect(critical).toEqual([]);
});
