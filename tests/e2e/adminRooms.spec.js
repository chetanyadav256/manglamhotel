import { expect, test } from '@playwright/test';
import { startRoomFixture } from '../fixtures/roomServer.js';

let fixture;
test.beforeEach(async ({ page, context }) => {
  fixture = await startRoomFixture();
  await context.addCookies([{ name: 'manglam_admin_session', value: fixture.token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  // Every API request goes to an isolated fixture server, never the Vite proxy
  // or configured Atlas database. Actual Express/session/CSRF handlers run.
  await page.route('**/api/**', async (route) => {
    const original = new URL(route.request().url());
    const response = await route.fetch({ url: `${fixture.url}${original.pathname}${original.search}` });
    await route.fulfill({ response });
  });
});
test.afterEach(async () => { await fixture.close(); });

async function createViaUi(page, name = 'Isolated test room') {
  await page.getByRole('link', { name: 'Add room', exact: true }).click();
  await page.getByLabel('Room name').fill(name);
  await page.getByRole('button', { name: 'Create draft', exact: true }).click();
  await expect(page).toHaveURL('/admin/rooms');
  return page.getByRole('article', { name, exact: true });
}

async function action(page, card, label) {
  await card.getByRole('button', { name: label, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: label, exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

test('room lifecycle integrates dashboard, editing, public listing, archive and restore', async ({ page }) => {
  await page.goto('/admin');
  await page.getByRole('link', { name: 'Rooms Management', exact: true }).click();
  await expect(page).toHaveURL('/admin/rooms');
  await page.evaluate(() => { window.__adminRoomNavigation = true; });
  const card = await createViaUi(page);
  await expect(card.getByText('Draft · Unpublished')).toBeVisible();
  expect(fixture.rooms.size).toBe(1);
  await card.getByRole('link', { name: 'Edit room' }).click();
  await expect(page.getByLabel('Room name')).toHaveValue('Isolated test room');
  await page.getByLabel('Description', { exact: true }).fill('Verified only within this isolated test fixture.');
  await page.getByLabel('Price per night').fill('1234.50');
  await page.getByLabel('Display order', { exact: true }).fill('5');
  await page.getByLabel('Amenities', { exact: true }).fill('Fixture amenity');
  await page.getByRole('button', { name: 'Add amenity', exact: true }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page).toHaveURL('/admin/rooms');
  await expect(card.getByText(/1,234.50/)).toBeVisible();
  expect(await page.evaluate(() => window.__adminRoomNavigation)).toBe(true);
  await action(page, card, 'Publish room');
  await expect(card.getByText('Published', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'View public rooms' }).click();
  await expect(page.locator('.room-card').getByRole('heading', { name: 'Isolated test room' })).toBeVisible();
  await expect(page.locator('.room-card').getByText('Fixture amenity')).toBeVisible();
  await expect(page.locator('.room-card').getByText('Room photographs coming soon')).toBeVisible();
  await page.locator('.room-card').getByRole('link', { name: 'Enquire Now' }).click();
  await expect(page).toHaveURL('/contact');
  await page.goto('/admin/rooms');
  await action(page, card, 'Unpublish room');
  await page.getByRole('link', { name: 'View public rooms' }).click();
  await expect(page.locator('.room-card')).toHaveCount(0);
  await expect(page.locator('.rooms-empty-state')).toBeVisible();
  await page.goto('/admin/rooms');
  await card.getByRole('button', { name: 'Archive room' }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Archive room' })).toBeFocused();
  await action(page, card, 'Archive room');
  await expect(card).toHaveCount(0);
  expect(fixture.rooms.size).toBe(1);
  await page.getByLabel('Show rooms').selectOption('archived');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(card.getByText('Archived · Unpublished')).toBeVisible();
  await expect(card.getByRole('button', { name: 'Publish room', exact: true })).toHaveCount(0);
  await action(page, card, 'Restore room');
  await expect(card).toHaveCount(0);
  await page.getByLabel('Show rooms').selectOption('active');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(card.getByText('Draft · Unpublished')).toBeVisible();
  await card.getByRole('link', { name: 'Edit room' }).click();
  await page.getByLabel('Price per night').fill('');
  await page.getByRole('button', { name: 'Remove Fixture amenity', exact: true }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(card.getByText('Price not provided')).toBeVisible();
  expect([...fixture.rooms.values()][0].amenities).toEqual([]);
});

test('validation, duplicates, unsaved changes and failed saves retain entries', async ({ page }) => {
  await page.goto('/admin/rooms/new');
  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect(page.getByRole('alert')).toContainText('Enter a room name');
  await page.getByLabel('Room name').fill('Kept fixture input');
  await page.getByLabel('Price per night').fill('-2');
  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect(page.getByRole('alert')).toContainText('non-negative');
  await page.getByLabel('Price per night').fill('');
  await page.getByLabel('Amenities', { exact: true }).fill(' Example ');
  await page.getByRole('button', { name: 'Add amenity' }).click();
  await page.getByLabel('Amenities', { exact: true }).fill('example');
  await page.getByRole('button', { name: 'Add amenity' }).click();
  await expect(page.getByText('This amenity has already been added.')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Discard unsaved changes?' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByLabel('Room name')).toHaveValue('Kept fixture input');
  fixture.state.failure = Object.assign(new Error('Isolated simulated outage'), { name: 'MongoNetworkError' });
  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect(page.getByText(/Your entries have been kept/)).toBeVisible();
  await expect(page.getByLabel('Room name')).toHaveValue('Kept fixture input');
  fixture.state.failure = null;
  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect(page).toHaveURL('/admin/rooms');
  expect(fixture.rooms.size).toBe(1);
});

test('unauthorized access redirects and invalid/deleted IDs and list failures are handled', async ({ page, context }) => {
  await page.goto('/admin/rooms/invalid/edit');
  await expect(page.getByRole('alert')).toContainText('Room ID is invalid.');
  await page.goto(`/admin/rooms/${'a'.repeat(24)}/edit`);
  await expect(page.getByRole('alert')).toContainText('Room not found.');
  fixture.state.failure = Object.assign(new Error('Simulated'), { name: 'MongoNetworkError' });
  await page.goto('/admin/rooms');
  await expect(page.getByRole('alert')).toContainText('Database is currently unavailable.');
  fixture.state.failure = null;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText(/No rooms to display/)).toBeVisible();
  await context.clearCookies();
  await page.goto('/admin/rooms');
  await expect(page).toHaveURL('/admin/login');
  await expect(page.getByRole('navigation', { name: 'Admin navigation' })).toHaveCount(0);
});

for (const width of [360, 393, 768, 1024, 1440]) {
  test(`room list, form and confirmation fit ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/admin/rooms');
    const card = await createViaUi(page, 'Responsive isolated fixture');
    await expect(card).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`admin-rooms-${width}.png`), fullPage: true });
    await card.getByRole('link', { name: 'Edit room' }).click();
    await expect(page.getByRole('heading', { name: 'Edit room', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`admin-room-form-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await card.getByRole('button', { name: 'Archive room' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const bounds = await dialog.boundingBox(); expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await page.getByLabel('Search rooms by name').fill('no matching record');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page.getByText('No rooms match your search.')).toBeVisible();
  });
}
