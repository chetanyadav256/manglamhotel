import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { app, createApp } from '../src/app.js';
import { readEnv } from '../src/config/env.js';
import Room from '../src/models/Room.js';
import MenuCategory from '../src/models/MenuCategory.js';
import MenuItem from '../src/models/MenuItem.js';
import SiteSettings from '../src/models/SiteSettings.js';
import { mongoFailureSummary } from '../src/config/database.js';
import { parsePagination } from '../src/utils/http.js';

let server;
let fixtureServer;
let baseUrl;
let fixtureUrl;

const publishedCategoryId = '111111111111111111111111';
const unpublishedCategoryId = '222222222222222222222222';
const publishedRoomId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const unpublishedRoomId = 'bbbbbbbbbbbbbbbbbbbbbbbb';

function matchesFilter(record, filter) {
  if (filter.isArchived?.$ne === true && record.isArchived === true) return false;
  if (filter.isPublished !== undefined && record.isPublished !== filter.isPublished) return false;
  if (filter._id !== undefined && String(record._id) !== String(filter._id)) return false;
  if (filter.singletonKey !== undefined && record.singletonKey !== filter.singletonKey) return false;
  if (filter.category?.$in) {
    return filter.category.$in.some((categoryId) => String(categoryId) === String(record.category));
  }
  return true;
}

function makeQuery(getRecords) {
  let skip = 0;
  let limit = Infinity;
  return {
    sort() { return this; },
    skip(value) { skip = value; return this; },
    limit(value) { limit = value; return this; },
    select() { return this; },
    lean() {
      const records = getRecords();
      if (Array.isArray(records)) return Promise.resolve(records.slice(skip, skip + limit));
      return Promise.resolve(records);
    },
  };
}

function createFixtureModels(records = {}) {
  const rooms = records.rooms ?? [
    { _id: publishedRoomId, name: 'Approved test room', isPublished: true, displayOrder: 0, amenities: [], images: [] },
    { _id: unpublishedRoomId, name: 'Unpublished test room', isPublished: false, displayOrder: 1, amenities: [], images: [] },
  ];
  const categories = records.categories ?? [
    { _id: publishedCategoryId, name: 'Approved test category', slug: 'approved-test-category', isPublished: true, displayOrder: 0 },
    { _id: unpublishedCategoryId, name: 'Unpublished test category', slug: 'unpublished-test-category', isPublished: false, displayOrder: 1 },
  ];
  const items = records.items ?? [
    { _id: '333333333333333333333333', category: publishedCategoryId, name: 'Available test item', isPublished: true, isAvailable: false, displayOrder: 0 },
    { _id: '444444444444444444444444', category: publishedCategoryId, name: 'Unpublished test item', isPublished: false, isAvailable: true, displayOrder: 1 },
    { _id: '555555555555555555555555', category: unpublishedCategoryId, name: 'Hidden category test item', isPublished: true, isAvailable: true, displayOrder: 2 },
  ];
  const settings = records.settings ?? {
    singletonKey: 'primary',
    hotelName: 'Manglam Hotel & Restaurant',
    phoneNumbers: ['+91 7568647755', '+91 9828809155'],
    instagramUrl: 'https://www.instagram.com/thehouseofmanglam/',
    address: 'XHMX+X8, Jaipur Phalodi Express Way, Kalwar Rd, Radha Krishna Enclave Scheme, Kalwad, Rajasthan 303706',
    googleMapsUrl: 'https://www.google.com/maps/place/MANGLAM+HOTEL+%26+RESTAURANT/',
  };

  return {
    Room: {
      find: (filter) => makeQuery(() => rooms.filter((room) => matchesFilter(room, filter))),
      countDocuments: async (filter) => rooms.filter((room) => matchesFilter(room, filter)).length,
      findOne: (filter) => makeQuery(() => rooms.find((room) => matchesFilter(room, filter)) ?? null),
    },
    MenuCategory: {
      find: (filter) => makeQuery(() => categories.filter((category) => matchesFilter(category, filter))),
      countDocuments: async (filter) => categories.filter((category) => matchesFilter(category, filter)).length,
    },
    MenuItem: {
      find: (filter) => makeQuery(() => items.filter((item) => matchesFilter(item, filter))),
      countDocuments: async (filter) => items.filter((item) => matchesFilter(item, filter)).length,
    },
    SiteSettings: {
      findOne: (filter) => makeQuery(() => settings.singletonKey === filter.singletonKey ? settings : null),
    },
  };
}

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  fixtureServer = createApp({
    models: createFixtureModels(),
    isDatabaseReady: () => true,
  }).listen(0, '127.0.0.1');
  await new Promise((resolve) => fixtureServer.once('listening', resolve));
  fixtureUrl = `http://127.0.0.1:${fixtureServer.address().port}`;
});

after(async () => {
  await Promise.all([server, fixtureServer].map((instance) => new Promise((resolve, reject) => {
    instance.close((error) => error ? reject(error) : resolve());
  })));
});

test('health endpoint returns API liveness with safe headers', async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok', service: 'manglam-hotel-api' });
  assert.match(response.headers.get('x-request-id'), /^[0-9a-f-]{36}$/i);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-powered-by'), null);
});

test('unknown API routes return JSON 404', async () => {
  const response = await fetch(`${baseUrl}/api/missing`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: { message: 'Route not found.' } });
});

test('malformed JSON gets a controlled error without a stack trace', async () => {
  const response = await fetch(`${baseUrl}/api/health`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"invalid":',
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: { message: 'Invalid request body.' } });
});

test('oversized request bodies are rejected', async () => {
  const response = await fetch(`${baseUrl}/api/health`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: 'x'.repeat(33 * 1024) }),
  });
  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), { error: { message: 'Request body is too large.' } });
});

test('environment configuration validates port and runtime mode', () => {
  assert.deepEqual(readEnv({}), {
    port: 5000,
    host: '127.0.0.1',
    nodeEnv: 'development',
    mongodbUri: '',
    allowedOrigins: ['http://127.0.0.1:5173', 'http://localhost:5173'],
    trustProxyHops: 0,
    publicSiteUrl: '',
  });
  for (const port of ['0', '65536', 'invalid', '1.5', '']) {
    assert.throws(() => readEnv({ PORT: port }), /PORT/);
  }
  for (const hops of ['-1', '11', '1.5', 'invalid']) {
    assert.throws(() => readEnv({ TRUST_PROXY_HOPS: hops }), /TRUST_PROXY_HOPS/);
  }
  assert.throws(() => readEnv({ NODE_ENV: 'invalid' }), /NODE_ENV/);
  assert.throws(() => readEnv({ ADMIN_ALLOWED_ORIGINS: 'https://example.com/path' }), /exact origins/);
  assert.throws(() => readEnv({ ADMIN_ALLOWED_ORIGINS: 'https://example.com,https://example.com' }), /duplicates/);
  assert.throws(() => readEnv({ NODE_ENV: 'production' }), /MONGODB_URI/);
  assert.throws(() => readEnv({
    NODE_ENV: 'production',
    MONGODB_URI: 'mongodb+srv://cluster.example.mongodb.net/manglam_hotel',
    PUBLIC_SITE_URL: 'https://manglam.example',
  }), /ADMIN_ALLOWED_ORIGINS/);
  const productionEnvironment = {
      NODE_ENV: 'production',
      MONGODB_URI: 'mongodb+srv://cluster.example.mongodb.net/manglam_hotel',
      PUBLIC_SITE_URL: 'https://manglam.example',
      ADMIN_ALLOWED_ORIGINS: 'https://manglam.example',
      IMAGEKIT_PRIVATE_KEY: 'test-only-imagekit-key',
    };
  assert.equal(readEnv(productionEnvironment).mongodbUri, productionEnvironment.MONGODB_URI);
  assert.equal(readEnv(productionEnvironment).host, '0.0.0.0');
  assert.equal(readEnv(productionEnvironment).publicSiteUrl, productionEnvironment.PUBLIC_SITE_URL);
  assert.deepEqual(
    readEnv({
      ...productionEnvironment,
      ADMIN_ALLOWED_ORIGINS: 'https://manglam.example,https://admin.manglam.example',
    }).allowedOrigins,
    ['https://manglam.example', 'https://admin.manglam.example'],
  );
  assert.throws(() => readEnv({
    ...productionEnvironment,
    PUBLIC_SITE_URL: 'https://other.example',
  }), /also appear in ADMIN_ALLOWED_ORIGINS/);
  assert.throws(() => readEnv({
    NODE_ENV: 'production',
    MONGODB_URI: 'mongodb+srv://cluster.example.mongodb.net/manglam_hotel',
    PUBLIC_SITE_URL: 'https://manglam.example',
    ADMIN_ALLOWED_ORIGINS: 'https://manglam.example',
  }), /IMAGEKIT_PRIVATE_KEY/);
  assert.throws(() => readEnv({
    NODE_ENV: 'production',
    MONGODB_URI: 'mongodb+srv://cluster.example.mongodb.net/manglam_hotel',
    PUBLIC_SITE_URL: 'http://manglam.example',
    ADMIN_ALLOWED_ORIGINS: 'http://manglam.example',
    IMAGEKIT_PRIVATE_KEY: 'test-only-imagekit-key',
  }), /HTTPS origin/);
});

test('MongoDB diagnostics are actionable without exposing connection details', () => {
  assert.equal(
    mongoFailureSummary({ code: 'ETIMEDOUT', message: 'mongodb+srv://private-value' }),
    'The connection timed out; check the Atlas IP access list and outbound network.',
  );
  assert.equal(
    mongoFailureSummary({ name: 'MongooseServerSelectionError', message: 'mongodb+srv://private-value' }),
    'Server selection failed; verify Atlas availability, network access, and connection settings.',
  );
});

test('database-backed APIs return 503 when MongoDB is unavailable', async () => {
  for (const path of ['/api/rooms', '/api/menu/categories', '/api/menu/items', '/api/site-settings']) {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: { message: 'Database is currently unavailable.' } });
  }
});

test('unexpected API errors do not expose internal message content', async () => {
  const unsafeModels = createFixtureModels();
  unsafeModels.Room.find = () => {
    throw new Error('private-database-detail');
  };
  const unsafeServer = createApp({
    models: unsafeModels,
    isDatabaseReady: () => true,
  }).listen(0, '127.0.0.1');
  await new Promise((resolve) => unsafeServer.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${unsafeServer.address().port}/api/rooms`);
    assert.equal(response.status, 500);
    const responseBody = await response.text();
    assert.equal(responseBody.includes('private-database-detail'), false);
    assert.deepEqual(JSON.parse(responseBody), { error: { message: 'Internal server error.' } });
  } finally {
    await new Promise((resolve, reject) => {
      unsafeServer.close((error) => error ? reject(error) : resolve());
    });
  }
});

test('public list routes reject invalid pagination and category filters', async () => {
  for (const path of [
    '/api/rooms?page=0',
    '/api/rooms?limit=101',
    '/api/rooms?sortBy=name',
    `/api/menu/items?category=${publishedCategoryId}&page=1e3`,
    '/api/menu/items?category%5B%24ne%5D=invalid',
  ]) {
    const response = await fetch(`${fixtureUrl}${path}`);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.message.length > 0, true);
  }
});

test('public APIs expose only published rooms and validate room IDs', async () => {
  const listResponse = await fetch(`${fixtureUrl}/api/rooms?page=1&limit=1`);
  assert.equal(listResponse.status, 200);
  assert.deepEqual(await listResponse.json(), {
    data: [{
      id: publishedRoomId,
      name: 'Approved test room',
      images: [],
      amenities: [],
    }],
    pagination: { page: 1, limit: 1, total: 1, totalPages: 1 },
  });

  const roomResponse = await fetch(`${fixtureUrl}/api/rooms/${publishedRoomId}`);
  assert.equal(roomResponse.status, 200);
  assert.equal((await roomResponse.json()).data.name, 'Approved test room');
  assert.equal((await fetch(`${fixtureUrl}/api/rooms/${unpublishedRoomId}`)).status, 404);
  const invalidId = await fetch(`${fixtureUrl}/api/rooms/not-an-id`);
  assert.equal(invalidId.status, 400);
  assert.deepEqual(await invalidId.json(), { error: { message: 'Room ID is invalid.' } });
});

test('public menu APIs hide unpublished content and preserve item availability', async () => {
  const categoriesResponse = await fetch(`${fixtureUrl}/api/menu/categories`);
  const categories = await categoriesResponse.json();
  assert.equal(categoriesResponse.status, 200);
  assert.deepEqual(categories.data.map(({ name }) => name), ['Approved test category']);

  const itemsResponse = await fetch(`${fixtureUrl}/api/menu/items?category=${publishedCategoryId}`);
  const items = await itemsResponse.json();
  assert.equal(itemsResponse.status, 200);
  assert.deepEqual(items.data.map(({ name }) => name), ['Available test item']);
  assert.equal(items.data[0].isAvailable, false);
  assert.equal(items.data[0].categoryId, publishedCategoryId);
  assert.equal((await fetch(`${fixtureUrl}/api/menu/items?category=invalid`)).status, 400);
});

test('list endpoints accept requests with no query parameters and return empty collections', async () => {
  assert.equal(app.get('query parser'), 'simple');
  const emptyServer = createApp({
    models: createFixtureModels({ rooms: [], categories: [], items: [] }),
    isDatabaseReady: () => true,
  }).listen(0, '127.0.0.1');
  await new Promise((resolve) => emptyServer.once('listening', resolve));
  try {
    for (const path of ['/api/rooms', '/api/menu/categories', '/api/menu/items']) {
      const response = await fetch(`http://127.0.0.1:${emptyServer.address().port}${path}`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        data: [],
        pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
      });
    }
    assert.deepEqual(parsePagination(), { page: 1, limit: 50, skip: 0 });
    assert.deepEqual(parsePagination(Object.create(null)), { page: 1, limit: 50, skip: 0 });
  } finally {
    await new Promise((resolve, reject) => {
      emptyServer.close((error) => error ? reject(error) : resolve());
    });
  }
});

test('site settings are returned as confirmed public values', async () => {
  const response = await fetch(`${fixtureUrl}/api/site-settings`);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, {
    hotelName: 'Manglam Hotel & Restaurant',
    phoneNumbers: ['+91 7568647755', '+91 9828809155'],
    instagramUrl: 'https://www.instagram.com/thehouseofmanglam/',
    address: 'XHMX+X8, Jaipur Phalodi Express Way, Kalwar Rd, Radha Krishna Enclave Scheme, Kalwad, Rajasthan 303706',
    googleMapsUrl: 'https://www.google.com/maps/place/MANGLAM+HOTEL+%26+RESTAURANT/',
  });
});

test('models enforce required fields, optional content and safe defaults', async () => {
  const room = new Room({ name: 'Approved room' });
  assert.equal(room.isPublished, false);
  assert.deepEqual(room.images, []);
  assert.deepEqual(room.amenities, []);
  await room.validate();
  await assert.rejects(new Room({ name: 'Invalid price room', pricePerNight: -1 }).validate(), (error) => Boolean(error.errors.pricePerNight));
  await assert.rejects(new Room({}).validate(), (error) => Boolean(error.errors.name));

  const category = new MenuCategory({ name: 'Published category', slug: 'published-category' });
  assert.equal(category.isPublished, false);
  await category.validate();
  await assert.rejects(new MenuCategory({ name: 'Missing slug' }).validate(), (error) => Boolean(error.errors.slug));
  assert.ok(MenuCategory.schema.indexes().some(([keys, options]) => keys.slug === 1 && options.unique));

  const item = new MenuItem({ name: 'Menu item', category: publishedCategoryId });
  assert.equal(item.isPublished, false);
  assert.equal(item.isAvailable, true);
  await item.validate();
  await assert.rejects(
    new MenuItem({ name: 'Invalid price item', category: publishedCategoryId, price: -1 }).validate(),
    (error) => Boolean(error.errors.price),
  );
  await assert.rejects(new MenuItem({ name: 'Missing category' }).validate(), (error) => Boolean(error.errors.category));

  await assert.rejects(new SiteSettings({}).validate(), (error) => Boolean(error.errors.hotelName));
});
