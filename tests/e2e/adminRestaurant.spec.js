import { expect, test } from '@playwright/test';
import { startRoomFixture } from '../fixtures/roomServer.js';

let fixture;
test.beforeEach(async ({ page, context }) => {
  fixture = await startRoomFixture();
  await context.addCookies([{ name: 'manglam_admin_session', value: fixture.token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  // No requests reach the configured backend, Atlas, or ImageKit.
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: `${fixture.url}${url.pathname}${url.search}` });
    await route.fulfill({ response });
  });
});
test.afterEach(async () => { await fixture.close(); });
const card = (page, name) => page.getByRole('article', { name, exact: true });
async function action(page, record, name) {
  await record.getByRole('button', { name, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name, exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function createCategory(page, name = 'Fixture category') {
  await page.getByRole('link', { name: 'Add category', exact: true }).click();
  await page.getByLabel('Category name').fill(name);
  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect(page).toHaveURL('/admin/restaurant');
  return card(page, name);
}
async function archiveFilter(page, value) {
  await page.getByLabel('Archive status').selectOption(value);
  await page.getByRole('button', { name: 'Apply filters' }).click();
}
async function seedCategory(name = 'Fixture category', published = false) {
  return fixture.models.MenuCategory.create({ name, slug: name.toLowerCase().replaceAll(' ', '-'), isPublished: published });
}

test('category and item lifecycle integrates dashboard, public filtering, availability, archiving and restoration', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('/admin');
  await page.getByRole('link', { name: 'Restaurant Management', exact: true }).click();
  await expect(page).toHaveURL('/admin/restaurant');
  await page.evaluate(() => { window.__menuNavigation = true; });
  let category = await createCategory(page);
  await expect(category.getByText('Draft · Unpublished')).toBeVisible();
  await category.getByRole('link', { name: 'Edit category' }).click();
  await page.getByLabel('Category name').fill('Renamed fixture category');
  await page.getByLabel('Description').fill('Description only for isolated testing.');
  await page.getByLabel('Display order').fill('4');
  await page.getByRole('button', { name: 'Save changes' }).click();
  category = card(page, 'Renamed fixture category');
  await expect(category).toContainText('Description only for isolated testing.');
  await page.getByRole('link', { name: 'Menu Items', exact: true }).click();
  await page.getByRole('link', { name: 'Add item', exact: true }).click();
  await page.getByLabel('Dish name').fill('Fixture dish');
  await page.locator('.menu-category-editor input[type=checkbox]').first().check();
  await page.getByLabel('Price (INR').fill('123.45');
  await page.getByRole('button', { name: 'Create draft' }).click();
  const dish = card(page, 'Fixture dish');
  await expect(dish.getByText('Draft · Unpublished')).toBeVisible();
  await action(page, dish, 'Publish item');
  await page.getByRole('link', { name: 'View public menu' }).click();
  await expect(page.locator('.menu-item-card')).toHaveCount(0);
  await page.goto('/admin/restaurant');
  await action(page, category, 'Publish category');
  await page.getByRole('link', { name: 'View public menu' }).click();
  await expect(page.locator('.menu-item-card')).toContainText('Fixture dish');
  await expect(page.locator('.menu-item-card')).toContainText('123.45');
  await expect(page.getByText('100% Pure Vegetarian', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Renamed fixture category', exact: true }).click();
  await expect(page.locator('.menu-item-card')).toHaveCount(1);
  await page.goto('/admin/restaurant/items');
  await action(page, dish, 'Mark unavailable');
  await dish.getByRole('link', { name: 'Edit item' }).click();
  await page.getByLabel('Price (INR').fill('');
  await page.getByLabel('Description').fill('Updated fixture dish description.');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.getByLabel('Filter by category').selectOption([...fixture.categories.keys()][0]);
  await page.getByLabel('Availability', { exact: true }).selectOption('unavailable');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(dish).toBeVisible();
  await page.getByRole('link', { name: 'View public menu' }).click();
  await expect(page.locator('.menu-item-card')).toContainText('Currently unavailable');
  await expect(page.locator('.menu-item-card')).toContainText('Price on request');
  await expect(page.getByLabel('Verified vegetarian')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /order|cart|book/i })).toHaveCount(0);
  await page.goto('/admin/restaurant');
  await action(page, category, 'Unpublish category');
  await page.getByRole('link', { name: 'View public menu' }).click();
  await expect(page.locator('.menu-item-card')).toHaveCount(0);
  await page.goto('/admin/restaurant');
  await category.getByRole('button', { name: 'Archive category' }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(category.getByRole('button', { name: 'Archive category' })).toBeFocused();
  await action(page, category, 'Archive category');
  await archiveFilter(page, 'archived');
  await expect(category.getByText('Archived · Unpublished')).toBeVisible();
  await action(page, category, 'Restore category');
  await archiveFilter(page, 'active');
  await expect(category.getByText('Draft · Unpublished')).toBeVisible();
  await page.getByRole('link', { name: 'Menu Items', exact: true }).click();
  await action(page, dish, 'Unpublish item');
  await action(page, dish, 'Archive item');
  await archiveFilter(page, 'archived');
  await action(page, dish, 'Restore item');
  await archiveFilter(page, 'active');
  await expect(dish.getByText('Draft · Unpublished')).toBeVisible();
  expect(fixture.categories.size).toBe(1); expect(fixture.items.size).toBe(1);
});

test('validation, duplicate category errors, failed saves and unsaved changes preserve entered values', async ({ page }) => {
  await seedCategory();
  await page.goto('/admin/restaurant/categories/new');
  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect(page.getByRole('alert')).toContainText('Enter a name');
  await page.getByLabel('Category name').fill('Fixture category');
  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect(page.getByRole('alert')).toContainText('already exists');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByLabel('Category name')).toHaveValue('Fixture category');
  await page.getByLabel('Category name').fill('Distinct fixture category');
  fixture.state.menuFailure = Object.assign(new Error('Fixture outage'), { name: 'MongoNetworkError' });
  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect(page.getByRole('alert')).toContainText('unavailable');
  await expect(page.getByLabel('Category name')).toHaveValue('Distinct fixture category');
  fixture.state.menuFailure = null;
  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect(page).toHaveURL('/admin/restaurant');
  await page.goto('/admin/restaurant/items/new');
  await page.getByLabel('Dish name').fill('Fixture dish');
  await page.getByLabel('Price (INR').fill('-1');
  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect(page.getByText('Select 1 to 50 active categories.', { exact: false })).toBeVisible();
  await expect(page.getByText('Enter a non-negative INR amount', { exact: false })).toBeVisible();
  await page.locator('.menu-category-editor input[type=checkbox]').first().check();
  await page.getByLabel('Price (INR').fill('0');
  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect(card(page, 'Fixture dish')).toBeVisible();
});

test('search, pagination, draft filters, invalid IDs, retry states and unauthorized redirects', async ({ page, context }) => {
  for (let index = 0; index < 13; index += 1) await seedCategory(`Fixture category ${index}`);
  await page.goto('/admin/restaurant');
  await expect(page.getByRole('article')).toHaveCount(12);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(1);
  await page.getByLabel('Search categories').fill('category 12');
  await page.getByLabel('Publication', { exact: true }).selectOption('draft');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(card(page, 'Fixture category 12')).toBeVisible();
  await page.getByLabel('Publication', { exact: true }).selectOption('published');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByText('No categories match these filters.', { exact: false })).toBeVisible();
  await page.goto('/admin/restaurant/categories/invalid/edit');
  await expect(page.getByRole('alert')).toContainText('ID is invalid');
  await page.goto(`/admin/restaurant/items/${'a'.repeat(24)}/edit`);
  await expect(page.getByRole('alert')).toContainText('not found');
  fixture.state.menuFailure = Object.assign(new Error('Fixture outage'), { name: 'MongoNetworkError' });
  await page.goto('/admin/restaurant');
  await expect(page.getByRole('alert')).toContainText('unavailable');
  fixture.state.menuFailure = null;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('article')).toHaveCount(12);
  await context.clearCookies();
  for (const path of ['/admin/restaurant', '/admin/restaurant/items', '/admin/restaurant/categories/new', '/admin/restaurant/items/new']) {
    await page.goto(path); await expect(page).toHaveURL('/admin/login');
  }
});

for (const width of [360, 393, 768, 1024, 1440]) {
  test(`restaurant management lists, forms and dialogs fit ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const parent = await seedCategory('Fixture category with a long name for responsive checks');
    const dish = await fixture.models.MenuItem.create({ name: 'Fixture dish with a long name for mobile wrapping', category: parent._id, price: 1234567.89, description: 'Fixture description. '.repeat(30) });
    const noOverflow = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.goto('/admin/restaurant');
    await expect(card(page, parent.name)).toBeVisible(); await noOverflow();
    await page.getByRole('link', { name: 'Add category', exact: true }).click();
    await expect(page.getByLabel('Category name')).toBeVisible(); await noOverflow();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.evaluate(() => { window.__restaurantSpa = true; });
    await page.getByRole('link', { name: 'Menu Items', exact: true }).click();
    await expect(card(page, dish.name)).toBeVisible(); await noOverflow();
    expect(await page.evaluate(() => window.__restaurantSpa)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`menu-list-${width}.png`), fullPage: true });
    await card(page, dish.name).getByRole('button', { name: 'Archive item' }).click();
    await expect(page.getByRole('dialog')).toBeVisible(); await noOverflow();
    await page.keyboard.press('Escape');
    await card(page, dish.name).getByRole('link', { name: 'Edit item' }).click();
    await expect(page.getByLabel('Dish name')).toHaveValue(dish.name); await noOverflow();
    await page.screenshot({ path: testInfo.outputPath(`menu-form-${width}.png`), fullPage: true });
    const button = await page.getByRole('button', { name: 'Save changes' }).boundingBox();
    expect(button.height).toBeGreaterThanOrEqual(44);
  });
}
