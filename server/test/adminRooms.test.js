import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { fixtureOrigin, startRoomFixture } from '../../tests/fixtures/roomServer.js';
import { validateRoomBody } from '../src/routes/adminRooms.js';
import Room from '../src/models/Room.js';

let fixture;
beforeEach(async () => { fixture = await startRoomFixture(); });
afterEach(async () => { await fixture.close(); });

function request(path = '', method = 'GET', body, overrides = {}) {
  return fetch(`${fixture.url}/api/admin/rooms${path}`, {
    method,
    headers: {
      Cookie: `manglam_admin_session=${fixture.token}; manglam_admin_csrf=${fixture.csrf}`,
      Origin: fixtureOrigin, 'X-CSRF-Token': fixture.csrf, 'Content-Type': 'application/json',
      ...overrides,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function create(values = {}) {
  const response = await request('', 'POST', { name: 'Fixture room', ...values });
  assert.equal(response.status, 201);
  return (await response.json()).data;
}
async function publicRooms() { return (await (await fetch(`${fixture.url}/api/rooms`)).json()).data; }

test('every room endpoint rejects unauthenticated and inactive admins', async () => {
  for (const [path, method, body] of [['', 'GET'], ['/aaaaaaaaaaaaaaaaaaaaaaaa', 'GET'], ['', 'POST', { name: 'Test' }], ['/aaaaaaaaaaaaaaaaaaaaaaaa', 'PATCH', { name: 'Test' }], ['/aaaaaaaaaaaaaaaaaaaaaaaa', 'DELETE', {}], ['/aaaaaaaaaaaaaaaaaaaaaaaa/restore', 'POST', {}]]) {
    assert.equal((await request(path, method, body, { Cookie: '' })).status, 401);
  }
  fixture.admin.isActive = false;
  assert.equal((await request()).status, 401);
});

test('mutations enforce session-bound CSRF, exact origin and JSON', async () => {
  const room = await create();
  for (const [path, method, body] of [['', 'POST', { name: 'Test' }], [`/${room.id}`, 'PATCH', { name: 'Test' }], [`/${room.id}`, 'DELETE', {}], [`/${room.id}/restore`, 'POST', {}]]) {
    assert.equal((await request(path, method, body, { 'X-CSRF-Token': '' })).status, 403);
    assert.equal((await request(path, method, body, { Origin: 'https://untrusted.example' })).status, 403);
    assert.equal((await request(path, method, body, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    assert.equal((await request(path, method, body, { 'Content-Type': 'text/plain' })).status, 415);
  }
  const forged = 'x'.repeat(43);
  assert.equal((await request('', 'POST', { name: 'Test' }, { Cookie: `manglam_admin_session=${fixture.token}; manglam_admin_csrf=${forged}`, 'X-CSRF-Token': forged })).status, 403);
  assert.equal((await request('', 'GET', undefined, { Origin: 'https://untrusted.example' })).status, 403);
});

test('creation normalizes values, deduplicates amenities and defaults to a draft', async () => {
  const room = await create({ name: '  Verified test  ', description: '  Line one\nLine two  ', amenities: [' Test label ', 'test LABEL', 'Another label'], pricePerNight: 0, displayOrder: 3 });
  assert.equal(room.name, 'Verified test');
  assert.equal(room.description, 'Line one\nLine two');
  assert.deepEqual(room.amenities, ['Test label', 'Another label']);
  assert.equal(room.pricePerNight, 0); assert.equal(room.isPublished, false); assert.equal(room.isArchived, false);
  assert.ok(room.createdAt); assert.ok(room.updatedAt);
  assert.deepEqual(await publicRooms(), []);
  assert.equal((await request(`/${room.id}`)).status, 200);
});

test('invalid bodies, unexpected fields, prices and quantities are rejected', async () => {
  for (const body of [null, [], {}, { name: ' ' }, { name: 'x'.repeat(121) }, { name: 123 }, { name: 'Test', description: 'x'.repeat(3001) }, { name: 'Test', description: null }, ...[-1, '123', 'NaN', {}, true, 1.234, 10000001].map((pricePerNight) => ({ name: 'Test', pricePerNight })), { name: 'Test', images: [] }, { name: 'Test', isArchived: true }, { name: 'Test', isPublished: true }, { name: 'Test', isPublished: 'false' }, { name: 'Test', $set: { name: 'bad' } }, { name: 'Test', amenities: [''] }, { name: 'Test', amenities: [4] }, { name: 'Test', amenities: ['x'.repeat(121)] }, { name: 'Test', amenities: Array(51).fill('test') }, { name: 'Test', displayOrder: 1.5 }]) {
    assert.equal((await request('', 'POST', body)).status, 400, JSON.stringify(body)?.slice(0, 90));
  }
  assert.throws(() => validateRoomBody({ name: 'Test', pricePerNight: NaN }, true), /Price/);
  assert.throws(() => validateRoomBody({ name: 'Test', pricePerNight: Infinity }, true), /Price/);
  assert.equal(fixture.rooms.size, 0);
});

test('editing and clearing an optional price preserves image metadata and rejects mass assignment', async () => {
  const room = await create({ pricePerNight: 1500 });
  const images = [{ url: 'https://example.com/approved-test.jpg', publicId: 'fixture-only', alt: 'Test image' }];
  fixture.rooms.get(room.id).images = images;
  const response = await request(`/${room.id}`, 'PATCH', { name: 'Updated test', description: 'New text', amenities: [' One ', 'one'], pricePerNight: null, displayOrder: 8 });
  assert.equal(response.status, 200);
  const updated = (await response.json()).data;
  assert.equal(updated.name, 'Updated test'); assert.equal(updated.pricePerNight, null); assert.equal(updated.displayOrder, 8);
  assert.deepEqual(fixture.rooms.get(room.id).images, images);
  assert.deepEqual(updated.amenities, ['One']);
  for (const body of [{ images: [] }, { _id: 'a'.repeat(24) }, { updatedAt: '2026-01-01' }, { isArchived: true }, { pricePerNight: -1 }, {}]) assert.equal((await request(`/${room.id}`, 'PATCH', body)).status, 400);
  for (const emptyPrice of ['', null]) assert.equal((await create({ pricePerNight: emptyPrice })).pricePerNight, null);
});

test('publish, unpublish, archive and restore follow public visibility rules', async () => {
  const room = await create({ pricePerNight: 2500, amenities: ['Test label'] });
  const detail = () => fetch(`${fixture.url}/api/rooms/${room.id}`);
  assert.equal((await detail()).status, 404);
  assert.equal((await request(`/${room.id}`, 'PATCH', { isPublished: true })).status, 200);
  assert.deepEqual((await publicRooms()).map(({ id }) => id), [room.id]);
  assert.deepEqual((await (await detail()).json()).data.pricePerNight, { amount: 2500, currency: 'INR' });
  assert.equal((await detail()).headers.get('cache-control'), 'no-store');
  assert.equal((await request(`/${room.id}`, 'PATCH', { isPublished: false })).status, 200);
  assert.deepEqual(await publicRooms(), []);
  await request(`/${room.id}`, 'PATCH', { isPublished: true });
  assert.equal((await request(`/${room.id}`, 'DELETE', {})).status, 200);
  assert.equal(fixture.rooms.size, 1); assert.equal(fixture.rooms.get(room.id).isPublished, false);
  assert.deepEqual(await publicRooms(), []); assert.equal((await detail()).status, 404);
  assert.equal((await request(`/${room.id}`, 'PATCH', { isPublished: true })).status, 409);
  assert.equal((await request(`/${room.id}`, 'PATCH', { name: 'stale edit' })).status, 409);
  fixture.rooms.get(room.id).isPublished = true; // Even inconsistent legacy content must remain hidden.
  assert.deepEqual(await publicRooms(), []); assert.equal((await detail()).status, 404);
  const restored = await request(`/${room.id}/restore`, 'POST', {});
  assert.equal(restored.status, 200); assert.equal((await restored.json()).data.isPublished, false);
  assert.deepEqual(await publicRooms(), []);
  assert.equal((await request(`/${room.id}/restore`, 'POST', {})).status, 409);
  await request(`/${room.id}`, 'PATCH', { isPublished: true });
  assert.equal((await publicRooms()).length, 1);
});

test('admin lists search literally, paginate and distinguish the archive including legacy rooms', async () => {
  const first = await create({ name: 'Test [room]', displayOrder: 10 });
  const second = await create({ name: 'Earlier room', displayOrder: 0 });
  delete fixture.rooms.get(first.id).isArchived; // No migration required for existing records.
  let response = await request('?status=all&limit=1&page=1');
  assert.equal((await response.json()).data[0].id, second.id);
  response = await request('?search=%5Broom%5D');
  assert.equal((await response.json()).data[0].id, first.id);
  await request(`/${first.id}`, 'DELETE', {});
  assert.equal((await (await request('?status=archived')).json()).data[0].id, first.id);
  assert.equal((await (await request()).json()).pagination.total, 1);
  for (const query of ['?limit=101', '?page=0', '?status=bad', '?search=a&search=b', '?name[$ne]=bad']) assert.equal((await request(query)).status, 400);
});

test('invalid and deleted IDs return safe errors on all ID routes', async () => {
  for (const [method, suffix, body] of [['GET', '', undefined], ['PATCH', '', { name: 'Test' }], ['DELETE', '', {}], ['POST', '/restore', {}]]) {
    assert.equal((await request(`/invalid${suffix}`, method, body)).status, 400);
    assert.equal((await request(`/${'a'.repeat(24)}${suffix}`, method, body)).status, 404);
  }
});

test('database outages and unexpected failures never become empty successes or leak details', async () => {
  fixture.state.ready = false;
  assert.equal((await request()).status, 503);
  fixture.state.ready = true;
  fixture.state.failure = Object.assign(new Error('private connection data'), { name: 'MongoNetworkError' });
  for (const [path, method, body] of [['', 'GET'], ['', 'POST', { name: 'Test' }], [`/${'a'.repeat(24)}`, 'PATCH', { name: 'Test' }]]) {
    const response = await request(path, method, body);
    assert.equal(response.status, 503); assert.equal((await response.text()).includes('private'), false);
  }
  fixture.state.failure = new Error('private internal detail');
  const response = await request(); assert.equal(response.status, 500); assert.equal((await response.text()).includes('private'), false);
});

test('room schema defaults to an unarchived draft', async () => {
  const room = new Room({ name: 'Fixture model test' });
  await room.validate(); assert.equal(room.isArchived, false); assert.equal(room.isPublished, false);
});
