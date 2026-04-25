import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Homepage mobile spec (412 × 915 viewport).
 *
 * Covers per D-34: nav drawer opens, ticker visible, gradient backdrop
 * confirmed (no matrix-rain DOM nodes — D-19/D-20 tiered strategy puts the
 * static gradient at base, so document.querySelectorAll('[data-rain-column]')
 * resolves to zero on a 412 px viewport).
 */
test.describe('homepage at 412 px', () => {
  test('nav drawer opens', async ({ page }) => {
    await page.goto('/');
    const hamburger = page.getByRole('button', { name: /open navigation/i });
    await expect(hamburger).toBeVisible();
    await hamburger.click();
    await expect(page.getByRole('dialog', { name: /main navigation/i })).toBeVisible();
  });

  test('ticker visible', async ({ page }) => {
    await page.goto('/');
    // Breaking ticker container — robust selector that survives copy edits.
    const ticker = page.locator('.breaking-ticker, .ticker-content').first();
    await expect(ticker).toBeVisible();
  });

  test('gradient backdrop confirmed (no matrix-rain DOM nodes at base)', async ({ page }) => {
    await page.goto('/');
    const rainNodes = await page.locator('[data-rain-column]').count();
    expect(rainNodes).toBe(0);
  });

  test('no a11y critical/serious', async ({ page }) => {
    await page.goto('/');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const critical = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious'
    );
    expect(critical).toEqual([]);
  });
});
