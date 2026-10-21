import { expect, test } from '@playwright/test';

const csrfToken = 'c'.repeat(43);
const admin = { id: 'fixture-admin', email: 'admin@example.com', name: 'Hotel Administrator' };

async function fulfillJson(route, status, body, headers = {}) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    headers,
    body: JSON.stringify(body),
  });
}

async function mockAdminApi(page) {
  let authenticated = false;
  await page.route('**/api/admin/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/admin/csrf' && request.method() === 'GET') {
      await fulfillJson(route, 200, { data: { csrfToken } }, {
        'set-cookie': `manglam_admin_csrf=${csrfToken}; Path=/; HttpOnly; SameSite=Strict`,
      });
      return;
    }
    if (path === '/api/admin/me' && request.method() === 'GET') {
      await fulfillJson(route, authenticated ? 200 : 401, authenticated
        ? { data: { admin } }
        : { error: { message: 'Authentication is required.' } });
      return;
    }
    if (path === '/api/admin/login' && request.method() === 'POST') {
      expect(request.headers()['x-csrf-token']).toBe(csrfToken);
      const body = request.postDataJSON();
      if (body.password !== 'valid fixture password') {
        await fulfillJson(route, 401, { error: { message: 'Email or password is incorrect.' } });
        return;
      }
      authenticated = true;
      await fulfillJson(route, 200, { data: { admin, csrfToken } }, {
        'set-cookie': `manglam_admin_session=${'s'.repeat(43)}; Path=/; HttpOnly; SameSite=Lax`,
      });
      return;
    }
    if (path === '/api/admin/logout' && request.method() === 'POST') {
      expect(request.headers()['x-csrf-token']).toBe(csrfToken);
      authenticated = false;
      await route.fulfill({ status: 204 });
      return;
    }
    await fulfillJson(route, 404, { error: { message: 'Route not found.' } });
  });
}

test('admin access redirects to login and displays accessible errors', async ({ page }) => {
  await mockAdminApi(page);
  await page.goto('/admin');
  await expect(page).toHaveURL('/admin/login');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  await page.getByLabel('Email address').fill('admin@example.com');
  await page.getByLabel('Password').fill('invalid fixture password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect.');
  await expect(page).toHaveURL('/admin/login');
});

test('dashboard authenticates, survives refresh, and signs out across target widths', async ({ page }) => {
  await mockAdminApi(page);
  await page.goto('/admin');
  await expect(page).toHaveURL('/admin/login');
  await page.getByLabel('Email address').fill('admin@example.com');
  await page.getByLabel('Password').fill('valid fixture password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/admin');
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Rooms Management/ })).toHaveAttribute('href', '/admin/rooms');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');

  for (const width of [360, 393, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `Admin dashboard overflows at ${width}px.`,
    ).toBe(true);
    const logoutButton = page.getByRole('button', { name: /Sign out/ });
    const box = await logoutButton.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  await page.getByRole('button', { name: /Sign out/ }).click();
  await expect(page).toHaveURL('/admin/login');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});
