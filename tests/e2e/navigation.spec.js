import { expect, test } from '@playwright/test';
import { contact } from '../../client/src/config/contact.js';

async function expectNoOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

for (const width of [360, 393, 768, 1024, 1440]) {
  test.describe(`${width}px viewport`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('home and contact fit the viewport with visible location and touch targets', async ({ page }, testInfo) => {
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/api/site-settings*', (route) => route.fulfill({ status: 503, body: '' }));
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1 })).toContainText('Welcome to');
      await expectNoOverflow(page);
      const location = page.getByRole('link', { name: /Manglam Hotel location/ });
      await expect(location).toBeVisible();
      await expect(location).toHaveAttribute('href', contact.maps);
      await expect(location).toHaveAttribute('target', '_blank');
      const box = await location.boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      const brand = await page.locator('header .brand').boundingBox();
      expect(brand.x + brand.width).toBeLessThanOrEqual(box.x);
      if (width < 768) {
        await expect(page.locator('.hero-mobile-actions').getByRole('link', { name: 'Explore Rooms' })).toBeInViewport();
        await expect(page.locator('.hero-mobile-actions').getByRole('link', { name: 'View Menu' })).toBeInViewport();
      } else {
        await expect(page.locator('.hero-art')).toBeVisible();
        await expect(page.locator('.hero-art')).toHaveCSS('opacity', '1');
      }
      await page.screenshot({ path: testInfo.outputPath(`home-${width}.png`), fullPage: true, animations: 'disabled' });
      await page.goto('/contact');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('We’re here to help.');
      await expectNoOverflow(page);
      await expect(page.locator('main h2')).toHaveText(['Phone numbers', 'Instagram', 'Hotel location']);
      for (const phone of contact.phones) {
        const link = page.locator('main').getByRole('link', { name: new RegExp(phone.label.replace('+', '\\+')) });
        await expect(link).toHaveAttribute('href', phone.href);
        expect((await link.boundingBox()).height).toBeGreaterThanOrEqual(44);
      }
      await page.screenshot({ path: testInfo.outputPath(`contact-${width}.png`), fullPage: true, animations: 'disabled' });
      expect(errors).toEqual([]);
    });

    test('SPA navigation, menu, back/forward and scroll restoration', async ({ page }, testInfo) => {
      await page.route('**/api/site-settings*', (route) => route.fulfill({ status: 503, body: '' }));
      await page.route('**/api/rooms*', (route) => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ data: [], pagination: { page: 1, limit: 100, total: 0, totalPages: 0 } }),
      }));
      await page.goto('/');
      await page.evaluate(() => { window.__spaMarker = 'same-document'; });
      if (width < 1024) {
        const toggle = page.getByRole('button', { name: /navigation menu/ });
        await toggle.focus();
        await page.keyboard.press('Enter');
        await expect(toggle).toHaveAttribute('aria-expanded', 'true');
        await expectNoOverflow(page);
        await page.screenshot({ path: testInfo.outputPath(`menu-${width}.png`), animations: 'disabled' });
        await page.keyboard.press('Tab');
        await expect(page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: 'Home', exact: true })).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(toggle).toBeFocused();
        await expect(toggle).toHaveAttribute('aria-expanded', 'false');
        await toggle.click();
        await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: 'Contact' }).click();
        await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeHidden();
      } else {
        await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Contact' }).click();
      }
      await expect(page).toHaveURL('/contact');
      await expect(page.locator('main')).toBeFocused();
      expect(await page.evaluate(() => window.__spaMarker)).toBe('same-document');
      await page.goBack();
      await expect(page).toHaveURL('/');
      await page.goForward();
      await expect(page).toHaveURL('/contact');
      expect(await page.evaluate(() => window.__spaMarker)).toBe('same-document');
      await page.goBack();
      const roomsLink = page.locator('#explore').getByRole('link', { name: 'Explore Rooms' });
      await roomsLink.scrollIntoViewIfNeeded();
      const priorScroll = await page.evaluate(() => window.scrollY);
      await roomsLink.click();
      await expect(page).toHaveURL('/rooms');
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
      await page.goBack();
      await expect(page).toHaveURL('/');
      await expect.poll(async () => Math.abs((await page.evaluate(() => window.scrollY)) - priorScroll)).toBeLessThan(3);
      const emptyPage = { data: [], pagination: { page: 1, limit: 100, total: 0, totalPages: 0 } };
      await page.route('**/api/menu/categories*', (route) => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(emptyPage),
      }));
      await page.route('**/api/menu/items*', (route) => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(emptyPage),
      }));
      await page.locator('#explore').getByRole('link', { name: 'View Menu' }).click();
      await expect(page).toHaveURL('/restaurant');
      await expect(page.getByText('Our menu will be available here soon.')).toBeVisible();
      expect(await page.evaluate(() => window.__spaMarker)).toBe('same-document');
    });
  });
}

test('confirmed contact links, room enquiry and protected admin route', async ({ page, context }) => {
  await page.route('**/api/site-settings*', (route) => route.fulfill({ status: 503, body: '' }));
  await page.route('**/api/admin/me', (route) => route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({ error: { message: 'Authentication is required.' } }),
  }));
  await page.goto('/contact');
  const instagram = page.locator('main').getByRole('link', { name: /Visit Instagram/ });
  await expect(instagram).toHaveAttribute('href', 'https://www.instagram.com/thehouseofmanglam/');
  await expect(instagram).toHaveAttribute('target', '_blank');
  const maps = page.locator('main').getByRole('link', { name: /Open Google Maps/ });
  await expect(maps).toHaveAttribute('href', contact.maps);
  await expect(maps).toHaveAttribute('rel', 'noopener noreferrer');
  // Intercept the destination: verify the new tab without depending on Google.
  await context.route('https://www.google.com/maps/**', (route) => route.fulfill({ body: 'Maps destination verified' }));
  const popupPromise = page.waitForEvent('popup');
  await maps.click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  expect(new URL(popup.url()).href).toBe(new URL(contact.maps).href);
  await popup.close();
  await page.route('**/api/rooms*', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      data: [{ id: 'fixture-room', name: 'Test room', images: [], amenities: [] }],
      pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    }),
  }));
  await page.goto('/rooms');
  await page.locator('.room-card').getByRole('link', { name: 'Enquire Now' }).click();
  await expect(page).toHaveURL('/contact');
  await page.goto('/admin');
  await expect(page).toHaveURL('/admin/login');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});

test('contact page uses API settings when available and preserves contact order', async ({ page }) => {
  await page.route('**/api/site-settings*', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      data: {
        hotelName: 'Fixture Hotel',
        phoneNumbers: ['+91 9000000001', '+91 9000000002'],
        instagramUrl: 'https://www.instagram.com/fixture-account/',
        address: 'Fixture address, Kalwad, Rajasthan',
        googleMapsUrl: 'https://www.google.com/maps/place/Fixture/',
      },
    }),
  }));
  await page.goto('/contact');

  await expect(page.locator('main h2')).toHaveText(['Phone numbers', 'Instagram', 'Hotel location']);
  await expect(page.locator('.phone-button').nth(0)).toHaveAttribute('href', 'tel:+919000000001');
  await expect(page.locator('.phone-button').nth(1)).toHaveAttribute('href', 'tel:+919000000002');
  await expect(page.getByRole('link', { name: 'Visit Instagram' })).toHaveAttribute('href', 'https://www.instagram.com/fixture-account/');
  await expect(page.getByRole('link', { name: 'Open Google Maps' })).toHaveAttribute('href', 'https://www.google.com/maps/place/Fixture/');
  await expect(page.locator('main address')).toHaveText('Fixture address, Kalwad, Rajasthan');
});

test('reduced motion disables animation and mobile menu closes on resize/outside click', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('/');
  expect(await page.locator('.hero-copy').evaluate((element) => getComputedStyle(element).animationName)).toBe('none');
  const toggle = page.getByRole('button', { name: 'Open navigation menu' });
  await toggle.click();
  await page.locator('h1').click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await page.setViewportSize({ width: 1024, height: 900 });
  await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeHidden();
  await page.setViewportSize({ width: 393, height: 852 });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});
