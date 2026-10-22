import { expect, test } from '@playwright/test';
import { startRoomFixture } from '../fixtures/roomServer.js';

let fixture;
let categories;
test.beforeEach(async ({ page, context }) => {
  fixture = await startRoomFixture();
  categories = [];
  for (const [name, published] of [['Fixture first', true], ['Fixture second', true], ['Fixture draft', false]]) {
    categories.push(await fixture.models.MenuCategory.create({ name, slug: name.replaceAll(' ', '-').toLowerCase(), isPublished: published }));
  }
  await context.addCookies([{ name: 'manglam_admin_session', value: fixture.token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({ response: await route.fetch({ url: `${fixture.url}${url.pathname}${url.search}` }) });
  });
});
test.afterEach(async () => { await fixture.close(); });

test('admin selects multiple categories, edits tags and preserves legacy images and prices', async ({ page }) => {
  const dish = await fixture.models.MenuItem.create({ name: 'Legacy fixture', category: categories[0]._id, price: 99.50, vegetarian: false });
  await page.goto(`/admin/restaurant/items/${dish._id}/edit`);
  await expect(page.getByRole('checkbox', { name: 'Fixture first' })).toBeChecked();
  await expect(page.getByLabel('Vegetarian indicator')).toHaveCount(0);
  await expect(page.getByText('Non-vegetarian', { exact: true })).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Fixture second' }).focus(); await page.keyboard.press('Space');
  await page.getByRole('checkbox', { name: 'Fixture draft (draft)' }).check();
  await page.getByLabel('Search tags (optional)').fill('  CURRY  ');
  await page.getByRole('button', { name: 'Add tag', exact: true }).click();
  await page.getByLabel('Search tags (optional)').fill('curry'); await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Remove tag curry' })).toHaveCount(1);
  await page.getByLabel('Search tags (optional)').fill('spice'); await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Remove tag spice' }).click();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page).toHaveURL('/admin/restaurant/items');
  const card = page.getByRole('article', { name: 'Legacy fixture', exact: true });
  await expect(card).toContainText('Fixture first, Fixture second, Fixture draft (draft)');
  await expect(card).toContainText('Tags: curry');
  expect(fixture.items.get(dish._id).price).toBe(99.5);
  expect(fixture.items.get(dish._id).vegetarian).toBe(false);
  await page.getByLabel('Filter by category').selectOption(categories[1]._id);
  await page.getByRole('button', { name: 'Apply filters' }).click(); await expect(card).toBeVisible();
  await card.getByRole('link', { name: 'Edit item' }).click();
  for (const name of ['Fixture first', 'Fixture second', 'Fixture draft (draft)']) await page.getByRole('checkbox', { name, exact: true }).uncheck();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Select 1 to 50 active categories');
  await page.getByRole('checkbox', { name: 'Fixture second' }).check();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page).toHaveURL('/admin/restaurant/items');
  expect(fixture.items.get(dish._id).categories).toEqual([categories[1]._id]);
});

for (const width of [360, 393, 768, 1024, 1440]) {
  test(`multi-category search and editor are accessible at ${width}px`, async ({ page }, testInfo) => {
    const dish = await fixture.models.MenuItem.create({ name: 'Fixture shared dish', categories: [categories[0]._id, categories[1]._id], tags: ['mild spice'], isPublished: true, isAvailable: false });
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/restaurant');
    await expect(page.getByText('100% Pure Vegetarian', { exact: true })).toBeVisible();
    await expect(page.locator('.menu-item-card')).toHaveCount(1);
    await page.evaluate(() => { window.__menuSpa = true; });
    let requests = 0; page.on('request', (request) => { if (request.url().includes('/api/menu/')) requests += 1; });
    await page.getByLabel('Search dishes or tags').fill(' MILD   SPICE ');
    await expect(page.locator('.menu-item-card')).toHaveCount(1);
    await expect(page.getByText('Currently unavailable')).toBeVisible();
    for (const name of ['Fixture first', 'Fixture second']) {
      await page.getByRole('button', { name, exact: true }).click();
      await expect(page.locator('.menu-item-card')).toHaveCount(1);
    }
    await page.getByLabel('Search dishes or tags').fill('not a match');
    await expect(page.getByRole('status')).toContainText('No dishes match your search');
    await page.getByRole('button', { name: 'Clear search' }).click();
    await expect(page.getByLabel('Search dishes or tags')).toBeFocused();
    await expect(page.locator('.menu-item-card')).toHaveCount(1);
    expect(requests).toBe(0); expect(await page.evaluate(() => window.__menuSpa)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`search-${width}.png`), fullPage: true });
    await page.goto(`/admin/restaurant/items/${dish._id}/edit`);
    await expect(page.getByRole('checkbox', { name: 'Fixture first' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Fixture second' })).toBeChecked();
    await expect(page.getByRole('button', { name: 'Remove tag mild spice' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`multi-category-form-${width}.png`), fullPage: true });
  });
}
