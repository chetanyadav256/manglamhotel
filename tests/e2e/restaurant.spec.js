import { expect, test } from '@playwright/test';

const fixtureCategories = [
  { id: 'starters', name: 'Fixture Starters', isPublished: true },
  { id: 'rice', name: 'Fixture Rice', isPublished: true },
  { id: 'empty', name: 'Fixture Empty Category', isPublished: true },
  { id: 'hidden', name: 'Unpublished Category', isPublished: false },
];

const fixtureItems = [
  {
    id: 'fixture-dish',
    categoryId: 'starters',
    name: 'Fixture Dish With a Deliberately Long Name for Wrapping',
    description: 'Fixture-only description.',
    priceInRupees: 1234.5,
    image: { src: '/missing-fixture-image.jpg' },
    isVegetarian: true,
    isAvailable: false,
    isPublished: true,
  },
  {
    id: 'fixture-request-price',
    categoryId: 'rice',
    name: 'Fixture Price on Request',
    isPublished: true,
  },
  {
    id: 'unpublished-dish',
    categoryId: 'starters',
    name: 'Unpublished Fixture Dish',
    isPublished: false,
  },
  {
    id: 'hidden-category-dish',
    categoryId: 'hidden',
    name: 'Hidden Category Fixture Dish',
    isPublished: true,
  },
];

function paginatedResponse(data) {
  return {
    data,
    pagination: { page: 1, limit: 100, total: data.length, totalPages: data.length ? 1 : 0 },
  };
}

async function injectMenu(page, { categories = fixtureCategories.filter((category) => category.isPublished), items = fixtureItems } = {}) {
  await page.route('**/api/site-settings*', (route) => route.fulfill({ status: 503, body: '' }));
  await page.route('**/api/menu/categories*', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(paginatedResponse(categories)),
  }));
  await page.route('**/api/menu/items*', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(paginatedResponse(items)),
  }));
  await page.route('**/missing-fixture-image.jpg', (route) => route.fulfill({ status: 404, body: '' }));
}

async function expectNoOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

for (const width of [360, 393, 768, 1024, 1440]) {
  test(`empty restaurant menu fits ${width}px and links to contact`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await injectMenu(page, { categories: [], items: [] });
    await page.goto('/restaurant');
    await expect(page.getByRole('heading', { level: 1, name: 'Manglam Restaurant' })).toBeVisible();
    await expect(page.getByText('Explore Our Menu')).toBeVisible();
    await expect(page.getByText('Our menu will be available here soon.')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Menu categories' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Contact Restaurant' })).toHaveAttribute('href', '/contact');
    await expectNoOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`restaurant-empty-${width}.png`),
      fullPage: true,
      animations: 'disabled',
    });

    await page.getByRole('link', { name: 'Contact Restaurant' }).click();
    await expect(page).toHaveURL('/contact');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
}

test('menu filters categories and hides unpublished items using isolated fixtures', async ({ page }) => {
  await injectMenu(page);
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('/restaurant');

  const categoryNavigation = page.getByRole('navigation', { name: 'Menu categories' });
  const allItemsButton = categoryNavigation.getByRole('button', { name: 'All Items' });
  const startersButton = categoryNavigation.getByRole('button', { name: 'Fixture Starters' });
  const riceButton = categoryNavigation.getByRole('button', { name: 'Fixture Rice' });
  const emptyButton = categoryNavigation.getByRole('button', { name: 'Fixture Empty Category' });

  await expect(allItemsButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Fixture Dish With a Deliberately Long Name for Wrapping' })).toBeVisible();
  await expect(page.getByText('₹1,234.5')).toBeVisible();
  await expect(page.getByText('Price on request', { exact: true })).toBeVisible();
  await expect(page.getByText('Fixture-only description.')).toBeVisible();
  await expect(page.getByText('Vegetarian')).toBeVisible();
  await expect(page.getByText('Currently unavailable')).toBeVisible();
  await expect(page.getByText('Unpublished Fixture Dish')).toHaveCount(0);
  await expect(page.getByText('Hidden Category Fixture Dish')).toHaveCount(0);
  await expect(page.getByText('Image not provided')).toHaveCount(2);

  await startersButton.focus();
  await page.keyboard.press('Enter');
  await expect(startersButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Fixture Dish With a Deliberately Long Name for Wrapping' })).toBeVisible();
  await expect(page.getByText('Fixture Price on Request')).toHaveCount(0);

  await riceButton.click();
  await expect(riceButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Fixture Price on Request')).toBeVisible();
  await expect(page.getByText('Fixture-only description.')).toHaveCount(0);

  await emptyButton.click();
  await expect(emptyButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('status')).toHaveText('No published items in this category yet.');
  await expect(page.getByRole('heading', { name: 'Fixture Price on Request' })).toHaveCount(0);

  await allItemsButton.click();
  await expect(allItemsButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Fixture Dish With a Deliberately Long Name for Wrapping' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Fixture Price on Request' })).toBeVisible();
  await expectNoOverflow(page);
});

for (const width of [360, 393, 768, 1024, 1440]) {
  test(`published menu cards and category controls fit ${width}px`, async ({ page }) => {
    await injectMenu(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/restaurant');

    const categoryNavigation = page.getByRole('navigation', { name: 'Menu categories' });
    await expect(categoryNavigation.getByRole('button', { name: 'Fixture Starters' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Fixture Dish With a Deliberately Long Name for Wrapping' })).toBeVisible();
    await expect(page.getByText('₹1,234.5')).toBeVisible();

    const categoryButton = await categoryNavigation.getByRole('button', { name: 'Fixture Starters' }).boundingBox();
    expect(categoryButton.height).toBeGreaterThanOrEqual(44);
    await expectNoOverflow(page);

    const columns = await page.locator('.menu-item-grid').first().evaluate((element) => (
      getComputedStyle(element).gridTemplateColumns.split(' ').length
    ));
    expect(columns).toBe(width < 640 ? 1 : width < 1024 ? 2 : 3);
  });
}

test('restaurant loading and API errors are not shown as an empty menu', async ({ page }) => {
  let retryRequested = false;
  await page.route('**/api/site-settings*', (route) => route.fulfill({ status: 503, body: '' }));
  let attempts = 0;
  await page.route('**/api/menu/categories*', async (route) => {
    attempts += 1;
    if (!retryRequested) {
      await new Promise((resolve) => setTimeout(resolve, 350));
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"error":{"message":"Database is currently unavailable."}}',
      });
      return;
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(paginatedResponse([])),
    });
  });
  await page.route('**/api/menu/items*', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(paginatedResponse([])),
  }));
  await page.goto('/restaurant');
  await expect(page.getByRole('status')).toHaveText('Loading menu information…');
  await expect(page.getByRole('alert')).toContainText('Menu information is temporarily unavailable.');
  await expect(page.getByText('Our menu will be available here soon.')).toHaveCount(0);
  retryRequested = true;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('Our menu will be available here soon.')).toBeVisible();
  expect(attempts).toBeGreaterThanOrEqual(2);
});
