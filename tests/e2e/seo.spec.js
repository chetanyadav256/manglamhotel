import { expect, test } from '@playwright/test';

test('public pages expose route-specific metadata and confirmed hotel structured data', async ({ page }) => {
  await page.route('**/api/site-settings*', (route) => route.fulfill({ status: 503, body: '' }));
  await page.route('**/api/rooms*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: [], pagination: { page: 1, limit: 100, total: 0, totalPages: 0 } }),
  }));
  await page.goto('/rooms');

  await expect(page).toHaveTitle('Rooms & Accommodation | Manglam Hotel & Restaurant');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    /Enquire about rooms at Manglam Hotel & Restaurant/,
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index, follow');
  await expect(page.getByRole('heading', { name: 'Rooms & accommodation', level: 1 })).toBeVisible();

  const structuredDataScript = page.locator('#site-structured-data');
  await expect.poll(async () => structuredDataScript.textContent()).toContain('"@type":"Hotel"');
  const structuredData = await structuredDataScript.textContent();
  const parsed = JSON.parse(structuredData);
  expect(parsed['@graph'].map((entity) => entity['@type'])).toEqual(['Hotel', 'Restaurant']);
  expect(JSON.stringify(parsed)).not.toMatch(/aggregateRating|review|openingHours|priceRange/);
});

test('admin entry routes are explicitly noindex', async ({ page }) => {
  await page.goto('/admin/login');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
});
