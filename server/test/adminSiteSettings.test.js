import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { fixtureOrigin, startRoomFixture } from '../../tests/fixtures/roomServer.js';
import SiteSettings from '../src/models/SiteSettings.js';

let fixture;

beforeEach(async () => { fixture = await startRoomFixture(); });
afterEach(async () => { await fixture.close(); });

const validBody = (overrides = {}) => ({
  hotelName: 'Manglam Hotel & Restaurant',
  phoneNumbers: ['+91 7568647755', '+91 9828809155'],
  instagramUrl: 'https://www.instagram.com/thehouseofmanglam/',
  address: 'XHMX+X8, Jaipur Phalodi Express Way, Kalwar Rd, Radha Krishna Enclave Scheme, Kalwad, Rajasthan 303706',
  googleMapsUrl: 'https://www.google.com/maps/place/MANGLAM+HOTEL+%26+RESTAURANT/',
  revision: 0,
  ...overrides,
});

function request(method = 'GET', body, headers = {}) {
  return fetch(`${fixture.url}/api/admin/site-settings`, {
    method,
    headers: {
      Cookie: `manglam_admin_session=${fixture.token}; manglam_admin_csrf=${fixture.csrf}`,
      Origin: fixtureOrigin,
      'X-CSRF-Token': fixture.csrf,
      'Content-Type': 'application/json',
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

test('protected settings reads require an active admin session', async () => {
  assert.equal((await request('GET', undefined, { Cookie: '' })).status, 401);
  fixture.admin.isActive = false;
  assert.equal((await request()).status, 401);
});

test('settings mutations enforce CSRF, origin and JSON request checks', async () => {
  assert.equal((await request('PATCH', validBody(), { 'X-CSRF-Token': '' })).status, 403);
  assert.equal((await request('PATCH', validBody(), { Origin: 'https://untrusted.example' })).status, 403);
  assert.equal((await request('PATCH', validBody(), { 'Content-Type': 'text/plain' })).status, 415);
});

test('admin settings retrieval returns only editable values and the concurrency revision', async () => {
  const response = await request();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await response.json()).data, {
    hotelName: fixture.settings.hotelName,
    phoneNumbers: fixture.settings.phoneNumbers,
    instagramUrl: fixture.settings.instagramUrl,
    address: fixture.settings.address,
    googleMapsUrl: fixture.settings.googleMapsUrl,
    revision: 0,
  });
});

test('valid settings updates persist atomically without creating a second settings record', async () => {
  const body = validBody({
    hotelName: '  Manglam House  ',
    phoneNumbers: ['7568647755', '+91-9828809155'],
    instagramUrl: 'https://instagram.com/manglam.house',
    address: '  Kalwad, Rajasthan  ',
    googleMapsUrl: 'https://maps.google.com/maps/place/example',
  });
  const response = await request('PATCH', body);
  assert.equal(response.status, 200, await response.clone().text());
  const updated = (await response.json()).data;
  assert.deepEqual(updated, {
    hotelName: 'Manglam House',
    phoneNumbers: ['+91 7568647755', '+91 9828809155'],
    instagramUrl: 'https://instagram.com/manglam.house',
    address: 'Kalwad, Rajasthan',
    googleMapsUrl: 'https://maps.google.com/maps/place/example',
    revision: 1,
  });
  assert.equal(fixture.settings.hotelName, 'Manglam House');
  assert.equal(fixture.settings.revision, 1);
  assert.equal(Object.keys(fixture.models).filter((name) => name === 'SiteSettings').length, 1);
});

test('phone numbers, external URLs, empty values and unexpected fields are rejected', async () => {
  const invalidBodies = [
    validBody({ phoneNumbers: ['1234567890', '+91 9828809155'] }),
    validBody({ phoneNumbers: ['+91 5568647755', '+91 9828809155'] }),
    validBody({ phoneNumbers: ['+91 7568647755'] }),
    validBody({ instagramUrl: 'javascript:alert(1)' }),
    validBody({ instagramUrl: 'https://instagram.com.evil.example/person' }),
    validBody({ instagramUrl: 'https://www.instagram.com/p/123/' }),
    validBody({ googleMapsUrl: 'http://www.google.com/maps/place/example' }),
    validBody({ googleMapsUrl: 'https://www.google.com.evil.example/maps/place/example' }),
    validBody({ googleMapsUrl: 'https://www.google.com/search?q=hotel' }),
    validBody({ hotelName: '  ' }),
    validBody({ address: 'x'.repeat(501) }),
    validBody({ unexpected: 'value' }),
    validBody({ $set: { hotelName: 'Injected' } }),
    (() => { const body = validBody(); delete body.revision; return body; })(),
  ];
  for (const body of invalidBodies) assert.equal((await request('PATCH', body)).status, 400, JSON.stringify(body));
  assert.equal(fixture.settings.hotelName, 'Manglam Hotel & Restaurant');
});

test('stale revisions conflict rather than replacing another administrators changes', async () => {
  const first = await request('PATCH', validBody({ hotelName: 'First update' }));
  assert.equal(first.status, 200);
  const stale = await request('PATCH', validBody({ hotelName: 'Stale update' }));
  assert.equal(stale.status, 409);
  assert.equal(fixture.settings.hotelName, 'First update');
  assert.equal(fixture.settings.revision, 1);
});

test('simultaneous writes with the same revision allow only one update', async () => {
  const responses = await Promise.all([
    request('PATCH', validBody({ hotelName: 'Concurrent update one' })),
    request('PATCH', validBody({ hotelName: 'Concurrent update two' })),
  ]);
  assert.deepEqual(responses.map(({ status }) => status).sort(), [200, 409]);
  assert.equal(fixture.settings.revision, 1);
  assert.ok(['Concurrent update one', 'Concurrent update two'].includes(fixture.settings.hotelName));
});

test('legacy singleton records without a revision can be updated safely', async () => {
  delete fixture.settings.revision;
  const response = await request('PATCH', validBody({ hotelName: 'Legacy updated' }));
  assert.equal(response.status, 200);
  assert.equal(fixture.settings.revision, 1);
  assert.equal(fixture.settings.hotelName, 'Legacy updated');
});

test('database outages return 503 and the public settings API remains read-only', async () => {
  fixture.state.ready = false;
  assert.equal((await request()).status, 503);
  assert.equal((await fetch(`${fixture.url}/api/site-settings`)).status, 503);

  fixture.state.ready = true;
  const publicResponse = await fetch(`${fixture.url}/api/site-settings`);
  assert.equal(publicResponse.status, 200);
  assert.equal(publicResponse.headers.get('cache-control'), 'no-store');
  const publicData = (await publicResponse.json()).data;
  assert.deepEqual(Object.keys(publicData).sort(), ['address', 'googleMapsUrl', 'hotelName', 'instagramUrl', 'phoneNumbers']);
  assert.equal(Object.hasOwn(publicData, 'revision'), false);
  assert.equal((await fetch(`${fixture.url}/api/site-settings`, { method: 'PATCH' })).status, 404);
});

test('singleton key retains its unique index', () => {
  assert.ok(SiteSettings.schema.indexes().some(([keys, options]) => keys.singletonKey === 1 && options.unique));
});
