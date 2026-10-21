import { expect, test } from '@playwright/test';

const csrfToken = 's'.repeat(43);

function defaultSettings() {
  return {
    hotelName: 'Manglam Hotel & Restaurant',
    phoneNumbers: ['+91 7568647755', '+91 9828809155'],
    instagramUrl: 'https://www.instagram.com/thehouseofmanglam/',
    address: 'XHMX+X8, Jaipur Phalodi Express Way, Kalwar Rd, Radha Krishna Enclave Scheme, Kalwad, Rajasthan 303706',
    googleMapsUrl: 'https://www.google.com/maps/place/MANGLAM+HOTEL+%26+RESTAURANT/',
    revision: 0,
  };
}

async function mockApis(page, { authenticated = true, conflict = false } = {}) {
  const state = { settings: defaultSettings(), authenticated, conflict };
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = async (status, data) => route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(data),
    });
    if (path === '/api/admin/csrf' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'set-cookie': `manglam_admin_csrf=${csrfToken}; Path=/; HttpOnly; SameSite=Strict` },
        body: JSON.stringify({ data: { csrfToken } }),
      });
      return;
    }
    if (path === '/api/admin/me' && request.method() === 'GET') {
      await json(state.authenticated ? 200 : 401, state.authenticated
        ? { data: { admin: { id: 'fixture-admin', email: 'admin@example.com', name: 'Fixture Administrator' } } }
        : { error: { message: 'Authentication is required.' } });
      return;
    }
    if (path === '/api/admin/site-settings' && request.method() === 'GET') {
      if (!state.authenticated) {
        await json(401, { error: { message: 'Authentication is required.' } });
        return;
      }
      await json(200, { data: state.settings });
      return;
    }
    if (path === '/api/admin/site-settings' && request.method() === 'PATCH') {
      expect(request.headers()['x-csrf-token']).toBe(csrfToken);
      if (state.conflict) {
        await json(409, { error: { message: 'Website settings changed in another session.' } });
        return;
      }
      const body = request.postDataJSON();
      expect(body.revision).toBe(state.settings.revision);
      state.settings = { ...body, revision: state.settings.revision + 1 };
      await json(200, { data: state.settings });
      return;
    }
    if (path === '/api/site-settings' && request.method() === 'GET') {
      const { revision: _revision, ...publicSettings } = state.settings;
      await json(200, { data: publicSettings });
      return;
    }
    await json(404, { error: { message: 'Route not found.' } });
  });
  return state;
}

test('settings remain protected and load existing values from the admin API', async ({ page }) => {
  await mockApis(page, { authenticated: false });
  await page.goto('/admin/settings');
  await expect(page).toHaveURL('/admin/login');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});

test('admin edits and saves settings which appear across public pages and persist after refresh', async ({ page }) => {
  const state = await mockApis(page);
  await page.goto('/admin/settings');
  await expect(page.getByRole('heading', { name: 'Website settings' })).toBeVisible();
  await expect(page.getByLabel('Hotel name')).toHaveValue('Manglam Hotel & Restaurant');
  await expect(page.getByLabel('Primary phone number')).toHaveValue('+91 7568647755');
  await expect(page.getByLabel('Secondary phone number')).toHaveValue('+91 9828809155');
  await expect(page.getByLabel('Google Maps URL')).toHaveValue(state.settings.googleMapsUrl);

  await page.getByLabel('Primary phone number').fill('12345');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Enter a valid 10-digit Indian mobile number.')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Enter a valid');
  await expect(page.getByLabel('Hotel name')).toHaveValue('Manglam Hotel & Restaurant');

  await page.getByLabel('Hotel name').fill('Manglam House');
  await page.getByLabel('Primary phone number').fill('+91 7012345678');
  await page.getByLabel('Secondary phone number').fill('+91 9812345678');
  await page.getByLabel('Instagram profile URL').fill('https://www.instagram.com/manglam.house/');
  await page.getByLabel('Hotel address').fill('New verified address, Kalwad, Rajasthan');
  await page.getByLabel('Google Maps URL').fill('https://www.google.com/maps/place/verified-listing/');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status')).toHaveText('Website settings saved.');
  expect(state.settings.revision).toBe(1);

  await page.getByRole('link', { name: 'Back to website' }).click();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Contact' }).click();
  await expect(page.locator('main').getByRole('link', { name: '+91 7012345678' })).toHaveAttribute('href', 'tel:+917012345678');
  await expect(page.locator('main').getByRole('link', { name: '+91 9812345678' })).toHaveAttribute('href', 'tel:+919812345678');
  await expect(page.locator('main').getByRole('link', { name: 'Visit Instagram' })).toHaveAttribute('href', 'https://www.instagram.com/manglam.house/');
  await expect(page.getByText('New verified address, Kalwad, Rajasthan').first()).toBeVisible();
  await expect(page.locator('.nav-location')).toHaveAttribute('href', 'https://www.google.com/maps/place/verified-listing/');
  await expect(page.locator('.site-footer')).toContainText('Manglam House');
  await expect(page.locator('footer').getByRole('link', { name: '+91 9812345678', exact: true })).toHaveAttribute('href', 'tel:+919812345678');
  await expect(page.locator('footer').getByRole('link', { name: 'Instagram profile' })).toHaveAttribute('href', 'https://www.instagram.com/manglam.house/');
  await expect(page.locator('footer').getByRole('link', { name: /Get directions/ })).toHaveAttribute('href', 'https://www.google.com/maps/place/verified-listing/');

  await page.locator('header').getByRole('link', { name: 'Manglam House home' }).click();
  await expect(page.getByRole('heading', { name: 'Find your way to Manglam.' })).toBeVisible();
  await expect(page.locator('.location-panel')).toContainText('New verified address, Kalwad, Rajasthan');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Contact' }).click();

  await page.reload();
  await expect(page.locator('main').getByRole('link', { name: '+91 7012345678' })).toBeVisible();
  await expect(page.locator('.site-footer')).toContainText('New verified address, Kalwad, Rajasthan');
});

test('unsaved edits can be reset or trigger a navigation warning at target viewport sizes', async ({ page }, testInfo) => {
  await mockApis(page);
  await page.goto('/admin/settings');
  await expect(page.getByRole('heading', { name: 'Website settings' })).toBeVisible();
  const address = page.getByLabel('Hotel address');
  for (const width of [360, 393, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await address.fill(`Unsaved address ${width}`);
    await expect(page.getByRole('button', { name: 'Reset changes' })).toBeEnabled();
    if (width === 360) {
      await page.getByRole('link', { name: 'Overview' }).click();
      await expect(page.getByRole('dialog', { name: 'Discard unsaved changes?' })).toBeVisible();
      await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
      await page.getByRole('button', { name: 'Reset changes' }).click();
      await expect(address).toHaveValue(defaultSettings().address);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `Settings page overflows at ${width}px.`).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`settings-${width}.png`),
      fullPage: true,
      animations: 'disabled',
    });
  }
});

test('stale update conflict is explained and offers a reload of latest values', async ({ page }) => {
  await mockApis(page, { conflict: true });
  await page.goto('/admin/settings');
  await page.getByLabel('Hotel name').fill('Conflicting value');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('alert')).toContainText('Reload the latest settings');
  await expect(page.getByRole('button', { name: 'Reload latest settings' })).toBeVisible();
});
