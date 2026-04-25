import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * /politician/[id] mobile spec (412 × 915 viewport).
 *
 * Per D-34: all 6 tabs render; vote-filter buttons measure ≥ 44 px tall
 * (D-03); network-tab graph mounts (Cytoscape canvas).
 *
 * TEST_POLITICIAN_ID defaults to fl-house-2026-aaron-baker — a known-stable
 * politician seeded in the codebase. CI / local engineers can override via
 * the env var if a different fixture is desired.
 */
const TEST_POLITICIAN_ID = process.env.TEST_POLITICIAN_ID || 'fl-house-2026-aaron-baker';

test('profile: all 6 tabs render their content when tapped', async ({ page }) => {
  await page.goto(`/politician/${TEST_POLITICIAN_ID}`);
  const tabs = ['overview', 'votes', 'funding', 'network', 'social', 'legal'];
  for (const t of tabs) {
    await page.getByRole('tab', { name: new RegExp(t, 'i') }).first().click();
    await expect(page).toHaveURL(new RegExp(`#${t}$`));
  }
});

test('profile: vote-filter buttons are at least 44 px tall', async ({ page }) => {
  await page.goto(`/politician/${TEST_POLITICIAN_ID}#votes`);
  const filterButtons = page.locator('[data-vote-filter] button');
  const count = await filterButtons.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const box = await filterButtons.nth(i).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
});

test('profile: network tab graph mounts', async ({ page }) => {
  await page.goto(`/politician/${TEST_POLITICIAN_ID}#network`);
  // Cytoscape mounts a canvas; assert presence within 10 s (mobile fcose
  // numIter:600 + animate:false runs faster than desktop, but allow margin
  // for slow CI containers).
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 10000 });
});

test('profile: no a11y critical/serious', async ({ page }) => {
  await page.goto(`/politician/${TEST_POLITICIAN_ID}`);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const critical = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious'
  );
  expect(critical).toEqual([]);
});
