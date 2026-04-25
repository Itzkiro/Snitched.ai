import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * /officials mobile spec (412 × 915 viewport).
 *
 * Per D-34: at least 1 politician card visible; no horizontal page scroll.
 * Uses the [data-politician-card] hook added in plan 10-04.
 */
test('officials: at least 1 politician card visible, no horizontal page scroll', async ({ page }) => {
  await page.goto('/officials');
  const cards = page.locator('[data-politician-card]');
  expect(await cards.count()).toBeGreaterThan(0);
  const horizontal = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth
  );
  expect(horizontal).toBe(true);
});

test('officials: no a11y critical/serious', async ({ page }) => {
  await page.goto('/officials');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const critical = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious'
  );
  expect(critical).toEqual([]);
});
