import { expect, test } from '@playwright/test';
import { startRoomFixture } from '../fixtures/roomServer.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nmFQAAAAASUVORK5CYII=', 'base64');
let fixture;

test.beforeEach(async ({ page, context }) => {
  fixture = await startRoomFixture();
  await context.addCookies([{
    name: 'manglam_admin_session',
    value: fixture.token,
    domain: '127.0.0.1',
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
  }]);
  await page.route('**/api/**', async (route) => {
    const original = new URL(route.request().url());
    const response = await route.fetch({ url: `${fixture.url}${original.pathname}${original.search}` });
    await route.fulfill({ response });
  });
  await page.route('https://ik.imagekit.io/**', (route) => route.fulfill({
    status: 200,
    contentType: 'image/png',
    body: png,
  }));
});

test.afterEach(async () => { await fixture.close(); });

test('admin can select, preview, upload, reorder and delete photos; the public gallery shows the selected main photo', async ({ page }) => {
  await page.goto('/admin/rooms/new');
  await page.getByLabel('Room name').fill('Isolated photo test room');
  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect(page).toHaveURL('/admin/rooms');
  await page.getByRole('link', { name: 'Edit room' }).click();
  await expect(page.getByRole('heading', { name: 'Room photos' })).toBeVisible();

  await page.getByLabel('Select room photos').setInputFiles([
    { name: 'first.png', mimeType: 'image/png', buffer: png },
    { name: 'second.png', mimeType: 'image/png', buffer: png },
  ]);
  await expect(page.locator('.admin-image-selected')).toHaveCount(2);
  await expect(page.locator('.admin-image-selected img')).toHaveCount(2);
  await expect(page.getByText('0 / 5 photos')).toBeVisible();
  await page.getByLabel('Alternative text (optional)').nth(0).fill('Fixture photo one');
  await page.getByLabel('Alternative text (optional)').nth(1).fill('Fixture photo two');
  await page.getByRole('button', { name: 'Upload 2 photos' }).click();
  await expect(page.getByText('2 / 5 photos')).toBeVisible();
  await expect(page.getByText('Room photos uploaded.')).toBeVisible();
  await expect(page.getByText('Main photo', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Set as main' }).nth(1).click();
  await expect(page.getByText('Main photo updated.')).toBeVisible();
  const deleteButton = page.getByRole('button', { name: 'Delete photo for Isolated photo test room' }).nth(1);
  await deleteButton.click();
  const dialog = page.getByRole('dialog', { name: 'Delete this room photo?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Delete photo' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('1 / 5 photos')).toBeVisible();

  for (const width of [360, 393, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(horizontalOverflow, `horizontal overflow at ${width}px`).toBe(false);
  }

  await page.goto('/admin/rooms');
  const roomCard = page.getByRole('article', { name: 'Isolated photo test room' });
  await roomCard.getByRole('button', { name: 'Publish room' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Publish room' }).click();
  await page.getByRole('link', { name: 'View public rooms' }).click();
  const gallery = page.locator('.room-card').getByRole('group', { name: 'Isolated photo test room photographs' });
  await expect(gallery.locator('img')).toHaveAttribute('alt', 'Fixture photo two');
});

test('invalid photo selections show validation errors and preserve the room form', async ({ page }) => {
  await page.goto('/admin/rooms/new');
  await page.getByLabel('Room name').fill('Invalid photo test room');
  await page.getByRole('button', { name: 'Create draft' }).click();
  await page.getByRole('link', { name: 'Edit room' }).click();
  await page.getByLabel('Select room photos').setInputFiles({
    name: 'not-an-image.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not a PNG image'),
  });
  await page.getByRole('button', { name: 'Upload 1 photo' }).click();
  await expect(page.getByRole('alert')).toContainText('file contents do not match a supported format');
  await expect(page.getByLabel('Room name')).toHaveValue('Invalid photo test room');
});
