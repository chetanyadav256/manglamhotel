import { expect, test } from '@playwright/test';

// Synthetic content is injected only into an isolated browser test's module
// response. No fixtures are imported by the production application.
const testPhoto = (color, label) => `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="${color}"/><text x="60" y="300" font-size="32" fill="white">${label}</text></svg>`,
)}`;

const fixtureRooms = [
  {
    id: 'test-multiple-photos',
    name: 'Synthetic room fixture — not hotel content',
    description: `${'Synthetic description for testing long text layout. '.repeat(12)}\n\nSecond paragraph must remain visible.`,
    amenities: ['Test amenity label', 'Synthetic long label '.repeat(6), 'UnbrokenTestValue'.repeat(8)],
    pricePerNight: { amount: 1234.5, currency: 'INR' },
    images: [
      { src: testPhoto('#203e37', 'TEST IMAGE ONE'), alt: 'Synthetic green test image' },
      { src: testPhoto('#805f36', 'TEST IMAGE TWO'), alt: 'Synthetic brown test image' },
      { src: '/__test_missing_photo__.png', alt: 'Synthetic unavailable image' },
    ],
  },
  { id: 'test-optional-fields', name: 'Synthetic minimal fixture' },
];

async function injectRooms(page, rooms = fixtureRooms) {
  await page.route('**/api/site-settings*', (route) => route.fulfill({ status: 503, body: '' }));
  await page.route('**/api/rooms*', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      data: rooms,
      pagination: { page: 1, limit: 100, total: rooms.length, totalPages: 1 },
    }),
  }));
  await page.route('**/__test_missing_photo__.png', (route) => route.fulfill({ status: 404, body: '' }));
}

async function expectNoOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

for (const width of [360, 393, 768, 1024, 1440]) {
  test.describe(`Rooms at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('empty listing, enquiry navigation and history', async ({ page }, testInfo) => {
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await injectRooms(page, []);
      await page.goto('/rooms');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Rooms & Accommodation');
      await expect(page).toHaveTitle('Rooms & Accommodation | Manglam Hotel & Restaurant');
      await expect(page.getByText('For room availability and details, please contact Manglam Hotel.')).toBeVisible();
      await expect(page.locator('.room-card')).toHaveCount(0);
      await expect(page.locator('main img')).toHaveCount(0);
      await expectNoOverflow(page);
      const brand = await page.locator('header .brand').boundingBox();
      const location = await page.locator('.nav-location').boundingBox();
      expect(brand.x + brand.width).toBeLessThanOrEqual(location.x);
      expect(location.width).toBeGreaterThanOrEqual(44);
      await page.screenshot({ path: testInfo.outputPath(`rooms-empty-${width}.png`), fullPage: true });

      await page.evaluate(() => { window.__roomsDocument = 'unchanged'; });
      for (const name of ['Enquire Now', 'Enquire About Rooms', 'Contact Hotel']) {
        const link = page.locator('main').getByRole('link', { name, exact: true });
        await expect(link).toHaveAttribute('href', '/contact');
        expect((await link.boundingBox()).height).toBeGreaterThanOrEqual(44);
        await link.scrollIntoViewIfNeeded();
        const previousScroll = await page.evaluate(() => window.scrollY);
        await link.click();
        await expect(page).toHaveURL('/contact');
        await expect(page.locator('main h2')).toHaveText(['Phone numbers', 'Instagram', 'Hotel location']);
        expect(await page.evaluate(() => window.__roomsDocument)).toBe('unchanged');
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
        await page.goBack();
        await expect(page).toHaveURL('/rooms');
        await expect.poll(async () => Math.abs((await page.evaluate(() => window.scrollY)) - previousScroll)).toBeLessThan(3);
        await page.goForward();
        await expect(page).toHaveURL('/contact');
        expect(await page.evaluate(() => window.__roomsDocument)).toBe('unchanged');
        await page.goBack();
        await expect(page).toHaveURL('/rooms');
      }
      expect(errors).toEqual([]);
    });

    test('cards support long content, optional price, missing photos and responsive layouts', async ({ page }, testInfo) => {
      await injectRooms(page);
      await page.goto('/rooms');
      const cards = page.locator('.room-card');
      await expect(cards).toHaveCount(2);
      await expect(page.locator('.rooms-empty-state')).toHaveCount(0);
      await expect(cards.first().locator('.room-price')).toHaveText('₹1,234.50 per night');
      await expect(cards.first().locator('.room-description')).toContainText('Second paragraph must remain visible.');
      await expect(cards.first().getByRole('listitem')).toHaveCount(3);
      await expect(cards.last().locator('.room-price')).toHaveCount(0);
      await expect(cards.last().getByText('Contact the hotel for current prices.')).toBeVisible();
      await expect(cards.last().getByText('Room photographs coming soon')).toBeVisible();
      await expect(cards.last().getByRole('list')).toHaveCount(0);
      await expectNoOverflow(page);
      const first = await cards.first().boundingBox();
      const second = await cards.last().boundingBox();
      if (width >= 768) expect(Math.abs(first.y - second.y)).toBeLessThan(2);
      else expect(second.y).toBeGreaterThan(first.y + first.height);
      await page.screenshot({ path: testInfo.outputPath(`rooms-fixtures-${width}.png`), fullPage: true });
      await page.evaluate(() => { window.__roomsDocument = 'unchanged'; });
      await cards.first().getByRole('link', { name: 'Enquire Now' }).click();
      await expect(page).toHaveURL('/contact');
      expect(await page.evaluate(() => window.__roomsDocument)).toBe('unchanged');
    });
  });
}

test('gallery keyboard controls, image errors, alt text and single-image behavior', async ({ page }) => {
  await injectRooms(page, [
    ...fixtureRooms,
    { id: 'test-one-image', name: 'Synthetic single image fixture', images: [{ src: testPhoto('#51664c', 'SINGLE TEST') }], pricePerNight: { amount: 0, currency: 'INR' } },
    { id: 'test-invalid-price', name: 'Synthetic invalid price fixture', pricePerNight: { amount: -1, currency: 'INR' } },
  ]);
  await page.goto('/rooms');
  const card = page.locator('.room-card').first();
  await card.scrollIntoViewIfNeeded();
  await expect(card.locator('.room-photo-frame img')).toHaveAttribute('alt', 'Synthetic green test image');
  const next = card.getByRole('button', { name: /Next photo/ });
  await next.focus();
  await page.keyboard.press('Enter');
  await expect(card.locator('.room-photo-frame img')).toHaveAttribute('alt', 'Synthetic brown test image');
  await expect(card.getByText('Photo 2 of 3')).toBeVisible();
  await next.press('Space');
  await expect(card.getByText('Photo currently unavailable')).toBeVisible();
  await expect(card.getByText('Photo 3 of 3')).toBeVisible();
  await next.click();
  await expect(card.getByText('Photo 1 of 3')).toBeVisible();
  await card.getByRole('button', { name: /Previous photo/ }).click();
  await expect(card.getByText('Photo 3 of 3')).toBeVisible();
  await card.getByRole('button', { name: /Show photo 2/ }).click();
  await expect(card.getByRole('button', { name: /Show photo 2/ })).toHaveAttribute('aria-pressed', 'true');
  const single = page.locator('.room-card').nth(2);
  await expect(single.locator('.room-photo-frame img')).toHaveAttribute('alt', 'Synthetic single image fixture — photo 1');
  await expect(single.getByRole('button')).toHaveCount(0);
  await expect(single.locator('.room-price')).toHaveText('₹0.00 per night');
  await expect(page.locator('.room-card').last().locator('.room-price')).toHaveCount(0);
});

test('room cards honor reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await injectRooms(page);
  await page.goto('/rooms');
  const card = page.locator('.room-card').first();
  await card.hover();
  expect(await card.evaluate((element) => getComputedStyle(element).transform)).toBe('none');
  expect(await card.evaluate((element) => getComputedStyle(element).transitionDuration)).toBe('0s');
});

test('rooms API loading, unavailable and retry states stay distinct from empty data', async ({ page }) => {
  let attempts = 0;
  let retryRequested = false;
  await page.route('**/api/rooms*', async (route) => {
    attempts += 1;
    if (!retryRequested) {
      await new Promise((resolve) => setTimeout(resolve, 350));
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":{"message":"Database is currently unavailable."}}' });
      return;
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ data: [], pagination: { page: 1, limit: 100, total: 0, totalPages: 0 } }),
    });
  });
  await page.goto('/rooms');
  await expect(page.getByRole('status')).toHaveText('Loading room information…');
  await expect(page.getByRole('alert')).toContainText('We couldn’t load room details.');
  retryRequested = true;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('For room availability and details, please contact Manglam Hotel.')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(attempts).toBeGreaterThanOrEqual(2);
});
