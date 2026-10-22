import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { startRoomFixture } from '../fixtures/roomServer.js';

const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#a57c45' } }).png().toBuffer();
let fixture; let dish; let category;
test.beforeEach(async ({ page, context }) => {
  fixture = await startRoomFixture();
  category = await fixture.models.MenuCategory.create({ name: 'Fixture category', slug: 'fixture', isPublished: true });
  dish = await fixture.models.MenuItem.create({ name: 'Fixture photo dish', category: category._id, price: 99.5, vegetarian: true, isAvailable: false, isPublished: true });
  await context.addCookies([{ name: 'manglam_admin_session', value: fixture.token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: `${fixture.url}${url.pathname}${url.search}` });
    await route.fulfill({ response });
  });
  await page.route('https://ik.imagekit.io/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: png }));
});
test.afterEach(async () => { await fixture.close(); });
const photo = (page) => page.getByRole('region', { name: 'Food photo', exact: true });
const editor = (page) => page.goto(`/admin/restaurant/items/${dish._id}/edit`);
async function select(page, label = 'Select food photo', fileName = 'fixture.png') {
  await page.getByLabel(label, { exact: true }).setInputFiles({ name: fileName, mimeType: 'image/png', buffer: png });
  await expect(page.getByRole('img', { name: 'Selected photo preview' })).toBeVisible();
}

test('saved dishes support preview, upload, alt editing, replacement, removal and public CDN rendering', async ({ page }) => {
  await editor(page);
  await expect(photo(page).getByText('Image not provided')).toBeVisible();
  await page.getByLabel('Price (INR').fill('150.25'); // Photo operations must preserve unsaved dish form values.
  await select(page);
  await page.getByLabel('Photo alternative text').fill('Fixture first view');
  fixture.storageState.delayMs = 600;
  await page.getByRole('button', { name: 'Upload photo', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saving photo changes' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Uploading photo…' })).toBeDisabled();
  await expect(photo(page).getByText('Photo saved.', { exact: true })).toBeVisible();
  await expect(photo(page).getByRole('img', { name: 'Fixture first view' })).toBeVisible();
  await expect(page.getByLabel('Price (INR')).toHaveValue('150.25');
  expect(fixture.items.get(dish._id).price).toBe(99.5);
  await page.getByLabel('Photo alternative text').fill('Fixture updated view');
  await page.getByRole('button', { name: 'Save alternative text' }).click();
  await expect(photo(page).getByText('Alternative text saved.')).toBeVisible();
  await select(page, 'Select replacement photo', 'replacement.png');
  await page.getByLabel('Photo alternative text').fill('Fixture replacement view');
  await page.getByRole('button', { name: 'Replace photo', exact: true }).click();
  await expect(photo(page).getByText('Photo saved.', { exact: true })).toBeVisible();
  expect(fixture.storageState.deletions).toEqual(['fixture-file-1']);
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page).toHaveURL('/admin/restaurant/items');
  await page.getByRole('link', { name: 'View public menu' }).click();
  const image = page.locator('.menu-item-card img');
  await expect(image).toHaveAttribute('alt', 'Fixture replacement view');
  await expect(image).toHaveAttribute('srcset', /480w.*800w.*1280w/);
  await expect(image).toHaveAttribute('loading', 'lazy');
  await expect(page.getByText('Currently unavailable')).toBeVisible();
  await expect(page.getByText('100% Pure Vegetarian', { exact: true })).toBeVisible();
  await expect(page.locator('.menu-item-price')).toContainText('150.25');
  await editor(page);
  await page.getByRole('button', { name: 'Remove photo', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(photo(page).getByRole('button', { name: 'Remove photo', exact: true })).toBeFocused();
  await photo(page).getByRole('button', { name: 'Remove photo', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove photo', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(photo(page).getByText('Photo removed.', { exact: true })).toBeVisible();
  await expect(photo(page).getByText('Image not provided')).toBeVisible();
  await page.goto('/restaurant');
  await expect(page.locator('.menu-item-card').getByText('Image not provided')).toBeVisible();
});

test('new dishes must be saved first; invalid file feedback and unsaved-photo warnings preserve forms', async ({ page }) => {
  await page.goto('/admin/restaurant/items/new');
  await expect(page.getByText('Save this dish first', { exact: false })).toBeVisible();
  await expect(page.locator('input[type=file]')).toHaveCount(0);
  await page.getByLabel('Dish name').fill('Saved fixture dish');
  await page.locator('.menu-category-editor input[type=checkbox]').first().check();
  await page.getByRole('button', { name: 'Create draft' }).click();
  await page.getByRole('article', { name: 'Saved fixture dish' }).getByRole('link', { name: 'Edit item' }).click();
  await page.getByLabel('Select food photo').setInputFiles({ name: 'bad.gif', mimeType: 'image/gif', buffer: png });
  await expect(photo(page).getByRole('alert')).toContainText('Select one non-empty');
  await page.getByLabel('Select food photo').setInputFiles({ name: 'spoof.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });
  await page.getByRole('button', { name: 'Upload photo', exact: true }).click();
  await expect(photo(page).getByRole('alert')).toContainText('contents do not match');
  await expect(page.getByLabel('Dish name')).toHaveValue('Saved fixture dish');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('Save or cancel photo changes before saving dish details.')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Discard unsaved changes?' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await select(page);
  await page.getByRole('button', { name: 'Upload photo', exact: true }).click();
  await expect(photo(page).getByText('Photo saved.', { exact: true })).toBeVisible();
});

test('failed replacement retains the old image and stale versions require explicit reload', async ({ page }) => {
  await editor(page); await select(page);
  await page.getByRole('button', { name: 'Upload photo', exact: true }).click();
  await expect(photo(page).getByText('Photo saved.', { exact: true })).toBeVisible();
  const original = fixture.items.get(dish._id).image.url;
  fixture.storageState.failUpload = true;
  await select(page, 'Select replacement photo');
  await page.getByRole('button', { name: 'Replace photo' }).click();
  await expect(photo(page).getByRole('alert')).toContainText('could not complete');
  await expect(photo(page).locator('.admin-menu-photo img')).toHaveAttribute('src', original);
  fixture.storageState.failUpload = false;
  fixture.items.get(dish._id).imageVersion += 1;
  await page.getByRole('button', { name: 'Replace photo' }).click();
  await expect(photo(page).getByRole('alert')).toContainText('photo changed');
  await page.getByRole('button', { name: 'Reload photo' }).click();
  await expect(page.getByLabel('Select replacement photo')).toBeEnabled();
  await select(page, 'Select replacement photo');
  await page.getByRole('button', { name: 'Replace photo' }).click();
  await expect(photo(page).getByText('Photo saved.', { exact: true })).toBeVisible();
});

test('photo controls, previews and confirmations remain usable at all target widths', async ({ page }, testInfo) => {
  await editor(page); await select(page);
  for (const width of [360, 393, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(photo(page).getByRole('img', { name: 'Selected photo preview' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const box = await page.getByRole('button', { name: 'Upload photo', exact: true }).boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: testInfo.outputPath(`menu-photo-${width}.png`), fullPage: true });
  }
  await page.getByRole('button', { name: 'Upload photo', exact: true }).click();
  await expect(photo(page).getByText('Photo saved.', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 360, height: 900 });
  await page.getByRole('button', { name: 'Remove photo', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
});
