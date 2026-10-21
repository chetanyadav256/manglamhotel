import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { access } from 'node:fs/promises';
import { dirname } from 'node:path';
import mongoose from 'mongoose';
import sharp from 'sharp';
import { fixtureOrigin, startRoomFixture } from '../../tests/fixtures/roomServer.js';
import { processMenuImageCleanup, menuCleanupRecord } from '../src/services/menuImageCleanup.js';
import MenuItem from '../src/models/MenuItem.js';

const raster = { create: { width: 12, height: 8, channels: 3, background: '#845522' } };
const png = await sharp(raster).png().toBuffer();
const jpeg = await sharp(raster).jpeg().toBuffer();
const webp = await sharp(raster).webp().toBuffer();
let fixture; let item;
beforeEach(async () => {
  fixture = await startRoomFixture();
  const parent = await fixture.models.MenuCategory.create({ name: 'Fixture only', slug: 'fixture', isPublished: true });
  item = await fixture.models.MenuItem.create({ name: 'Fixture dish', category: parent._id, price: 45.50, vegetarian: true, isAvailable: false, isPublished: true });
});
afterEach(async () => { await fixture.close(); });
const headers = () => ({ Cookie: `manglam_admin_session=${fixture.token}; manglam_admin_csrf=${fixture.csrf}`, Origin: fixtureOrigin, 'X-CSRF-Token': fixture.csrf });
async function request(method = 'GET', body, id = item._id, extra = {}) {
  return fetch(`${fixture.url}/api/admin/menu/items/${id}/image`, { method, headers: { ...headers(), 'Content-Type': 'application/json', ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function upload({ method = 'POST', id = item._id, version = 0, operationId = randomUUID(), buffer = png, type = 'image/png', fields = {}, extraHeaders = {}, count = 1 } = {}) {
  const form = new FormData();
  for (let i = 0; i < count; i += 1) form.append('image', new Blob([buffer], { type }), 'fixture-photo');
  for (const [key, value] of Object.entries({ version: String(version), operationId, alt: ' Fixture photo ', ...fields })) form.append(key, value);
  return fetch(`${fixture.url}/api/admin/menu/items/${id}/image`, { method, headers: { ...headers(), ...extraHeaders }, body: form });
}
const json = async (response) => (await response.json()).data;
const mutation = (version = 1, fields = {}) => ({ version, operationId: randomUUID(), ...fields });

test('image endpoints enforce admin sessions, CSRF, origins, strict fields and IDs', async () => {
  for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
    assert.equal((await request(method, method === 'GET' ? undefined : {}, item._id, { Cookie: '' })).status, 401);
    if (method !== 'GET') {
      assert.equal((await request(method, {}, item._id, { 'X-CSRF-Token': '' })).status, 403);
      assert.equal((await request(method, {}, item._id, { Origin: 'https://untrusted.example' })).status, 403);
      assert.equal((await request(method, {}, item._id, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    }
  }
  assert.equal((await upload({ id: 'invalid' })).status, 400);
  assert.equal((await upload({ id: 'a'.repeat(24) })).status, 404);
  assert.equal((await upload({ fields: { fileId: 'unrelated' } })).status, 400);
  assert.equal((await upload({ fields: { version: '-1' } })).status, 400);
  assert.equal((await upload({ operationId: 'invalid' })).status, 400);
  assert.equal((await upload({ fields: { alt: 'x'.repeat(301) } })).status, 400);
  assert.equal((await request('POST', mutation(0))).status, 415);
  assert.equal((await request('DELETE', { ...mutation(0), fileId: 'unrelated' })).status, 400);
  assert.equal((await fetch(`${fixture.url}/api/admin/menu/items/${item._id}/image?extra=x`, { headers: headers() })).status, 400);
  assert.equal(fixture.storageState.uploads.length, 0);
});

for (const [name, buffer, type] of [['JPEG', jpeg, 'image/jpeg'], ['PNG', png, 'image/png'], ['WebP', webp, 'image/webp']]) test(`valid ${name} uploads persist one owned image and preserve dish fields`, async () => {
  const response = await upload({ buffer, type }); assert.equal(response.status, 201);
  const data = await json(response); assert.equal(data.version, 1); assert.equal(data.image.alt, 'Fixture photo'); assert.equal(data.image.managed, true);
  const stored = fixture.items.get(item._id);
  assert.equal(stored.image.fileId, 'fixture-file-1'); assert.ok(stored.image.filePath.startsWith(`/manglam-hotel/restaurant/${item._id}/`));
  assert.equal(stored.price, item.price); assert.equal(stored.name, item.name); assert.equal(stored.category, item.category);
  assert.equal(stored.vegetarian, true); assert.equal(stored.isAvailable, false); assert.equal(stored.isPublished, true);
  await new MenuItem(stored).validate();
  assert.equal((await json(await request())).image.url, stored.image.url);
  await assert.rejects(access(dirname(fixture.storageState.uploadPaths[0])), { code: 'ENOENT' });
});

test('malformed images, spoofed MIME, oversized, empty and multiple files are rejected before ImageKit', async () => {
  for (const options of [{ type: 'image/gif' }, { type: 'image/jpeg' }, { buffer: Buffer.from('not PNG') }, { buffer: png.subarray(0, 30) }, { buffer: webp.subarray(0, 15), type: 'image/webp' }]) assert.equal((await upload(options)).status, 415);
  const corrupt = Buffer.from(jpeg); corrupt.fill(0, 100, 200);
  assert.equal((await upload({ buffer: corrupt, type: 'image/jpeg' })).status, 415);
  assert.equal((await upload({ buffer: Buffer.alloc(0) })).status, 400);
  assert.equal((await upload({ count: 0 })).status, 400);
  assert.equal((await upload({ count: 2 })).status, 400);
  assert.equal((await upload({ buffer: Buffer.concat([png, Buffer.alloc(5 * 1024 * 1024)]) })).status, 413);
  assert.equal(fixture.storageState.uploads.length, 0);
});

test('first upload, replacement, alt edit, removal and duplicate retries preserve exactly one current image', async () => {
  assert.equal((await json(await request())).image, null);
  const operationId = randomUUID();
  assert.equal((await upload({ operationId })).status, 201);
  assert.equal((await upload({ operationId })).status, 200);
  assert.equal(fixture.storageState.uploads.length, 1);
  assert.equal((await upload({ version: 1 })).status, 409);
  assert.equal((await upload({ method: 'PUT', version: 0 })).status, 409);
  const replacing = randomUUID();
  const replacement = await upload({ method: 'PUT', version: 1, operationId: replacing }); assert.equal(replacement.status, 200);
  assert.deepEqual(fixture.storageState.deletions, ['fixture-file-1']);
  assert.equal(fixture.items.get(item._id).image.fileId, 'fixture-file-2');
  assert.equal((await upload({ method: 'PUT', version: 1, operationId: replacing })).status, 200);
  assert.equal(fixture.storageState.uploads.length, 2);
  assert.equal((await request('PATCH', mutation(2, { alt: ' Updated description ' }))).status, 200);
  assert.equal(fixture.items.get(item._id).image.alt, 'Updated description');
  const removing = mutation(3);
  assert.equal((await request('DELETE', removing)).status, 200);
  assert.equal((await request('DELETE', removing)).status, 200);
  assert.equal((await json(await request())).image, null);
  assert.deepEqual(fixture.storageState.deletions, ['fixture-file-1', 'fixture-file-2']);
  assert.equal((await upload({ method: 'PUT', version: 4 })).status, 409);
});

test('archived items reject every image mutation while reads and existing metadata remain available', async () => {
  await upload(); const original = structuredClone(fixture.items.get(item._id).image);
  fixture.items.get(item._id).isArchived = true;
  for (const method of ['POST', 'PUT']) assert.equal((await upload({ method, version: 1 })).status, 409);
  for (const method of ['PATCH', 'DELETE']) assert.equal((await request(method, mutation(1, method === 'PATCH' ? { alt: 'changed' } : {}))).status, 409);
  assert.equal((await request()).status, 200); assert.deepEqual(fixture.items.get(item._id).image, original);
  assert.deepEqual(fixture.storageState.deletions, []);
});

test('ImageKit and database failures preserve the old photo and compensate only the failed upload', async () => {
  await upload(); const original = structuredClone(fixture.items.get(item._id).image);
  fixture.storageState.failUpload = true;
  assert.equal((await upload({ method: 'PUT', version: 1 })).status, 502);
  assert.deepEqual(fixture.items.get(item._id).image, original);
  fixture.storageState.failUpload = false; fixture.state.menuImageWriteFailure = 'before';
  assert.equal((await upload({ method: 'PUT', version: 1 })).status, 503);
  assert.deepEqual(fixture.items.get(item._id).image, original);
  assert.deepEqual(fixture.storageState.deletions, ['fixture-file-2']);
  assert.equal(fixture.items.get(item._id).imageVersion, 2); // Fences potentially delayed writes.
  assert.equal((await upload({ method: 'PUT', version: 2 })).status, 200);
});

test('lost database acknowledgement is confirmed and never deletes the committed new photo', async () => {
  await upload(); fixture.state.menuImageWriteFailure = 'after';
  const operationId = randomUUID();
  assert.equal((await upload({ method: 'PUT', version: 1, operationId })).status, 200);
  assert.equal(fixture.items.get(item._id).image.fileId, 'fixture-file-2');
  assert.deepEqual(fixture.storageState.deletions, ['fixture-file-1']);
  assert.equal((await upload({ method: 'PUT', version: 1, operationId })).status, 200);
  assert.equal(fixture.storageState.uploads.length, 2);
});

test('unconfirmable persistence retains both assets and returns a safe recovery response', async () => {
  await upload(); const original = structuredClone(fixture.items.get(item._id).image);
  fixture.state.disconnectDuringUpload = true;
  const response = await upload({ method: 'PUT', version: 1 });
  assert.equal(response.status, 503); assert.match((await response.json()).error.message, /could not be confirmed/);
  assert.deepEqual(fixture.items.get(item._id).image, original);
  assert.deepEqual(fixture.storageState.deletions, []);
  assert.equal(fixture.storageState.uploads.length, 2);
});

test('concurrent replacements commit once and clean only displaced or losing uploads', async () => {
  await upload(); fixture.storageState.delayMs = 80;
  const responses = await Promise.all([upload({ method: 'PUT', version: 1 }), upload({ method: 'PUT', version: 1 })]);
  assert.deepEqual(responses.map(({ status }) => status).sort(), [200, 409]);
  const current = fixture.items.get(item._id).image;
  assert.equal(fixture.items.get(item._id).imageVersion, 2);
  assert.equal(fixture.storageState.deletions.includes(current.fileId), false);
  assert.deepEqual(new Set(fixture.storageState.deletions), new Set(fixture.storageState.uploads.filter((image) => image.fileId !== current.fileId).map(({ fileId }) => fileId)));
});

test('failed old-file deletion and compensation deletion remain queued for retry, including archived items', async () => {
  await upload(); fixture.storageState.failDelete = true;
  const response = await upload({ method: 'PUT', version: 1 }); assert.equal(response.status, 200);
  assert.equal((await json(response)).cleanupPending, true);
  assert.equal(fixture.items.get(item._id).pendingImageCleanup[0].fileId, 'fixture-file-1');
  fixture.state.menuImageWriteFailure = 'before';
  assert.equal((await upload({ method: 'PUT', version: 2 })).status, 503);
  assert.equal(fixture.items.get(item._id).pendingImageCleanup.length, 2);
  fixture.items.get(item._id).isArchived = true;
  fixture.storageState.failDelete = false;
  await processMenuImageCleanup({ models: fixture.models, imageStorage: fixture.imageStorage });
  assert.deepEqual(fixture.items.get(item._id).pendingImageCleanup, []);
  assert.equal(fixture.storageState.deletions.includes('fixture-file-2'), false);
});

test('legacy photos can be replaced or removed without deleting unrelated media and cleanup never deletes current assets', async () => {
  const legacy = { url: 'https://example.test/photo.jpg', publicId: 'legacy' };
  fixture.items.get(item._id).image = legacy;
  const replaced = await upload({ method: 'PUT' }); assert.equal(replaced.status, 200);
  assert.equal((await json(replaced)).legacyAssetRetained, true);
  assert.deepEqual(fixture.storageState.deletions, []);
  const current = fixture.items.get(item._id).image;
  fixture.items.get(item._id).pendingImageCleanup = [menuCleanupRecord(current), menuCleanupRecord({ fileId: 'room-file', filePath: `/manglam-hotel/rooms/${item._id}/test.png` })];
  await processMenuImageCleanup({ models: fixture.models, imageStorage: fixture.imageStorage });
  assert.deepEqual(fixture.storageState.deletions, []);
  fixture.items.get(item._id).image = legacy; fixture.items.get(item._id).pendingImageCleanup = [];
  assert.equal((await request('DELETE', mutation(1))).status, 200);
  assert.deepEqual(fixture.storageState.deletions, []);
});

test('public photos get responsive ImageKit URLs while publication, pricing and availability remain unchanged', async () => {
  await upload();
  const publicMenu = async () => (await (await fetch(`${fixture.url}/api/menu/items`)).json()).data;
  const [dish] = await publicMenu();
  assert.match(dish.image.src, /tr:w-800,q-80,f-auto/); assert.match(dish.image.srcSet, /480w.*800w.*1280w/);
  assert.equal(dish.image.alt, 'Fixture photo'); assert.equal(dish.priceInRupees, 45.5); assert.equal(dish.isAvailable, false); assert.equal(dish.isVegetarian, true);
  fixture.items.get(item._id).isPublished = false; assert.deepEqual(await publicMenu(), []);
});

test('installed Mongoose casts and validates the single-image operator update without a pipeline', async () => {
  const Model = new mongoose.Mongoose().model('IsolatedMenuImage', MenuItem.schema.clone());
  let written;
  Model.collection.findOneAndUpdate = async (filter, update) => { written = { filter, update }; return { ...item, image: update.$set.image }; };
  await Model.findOneAndUpdate({ _id: item._id, imageVersion: 0 }, { $set: { image: { fileId: 'fixture', filePath: `/manglam-hotel/restaurant/${item._id}/fixture.png`, url: 'https://example.test/fixture.png', alt: '  Test  ' } }, $inc: { imageVersion: 1 } }, { returnDocument: 'after', runValidators: true }).lean();
  assert.equal(Array.isArray(written.update), false); assert.equal(written.filter._id.constructor.name, 'ObjectId'); assert.equal(written.update.$set.image.alt, 'Test');
  await assert.rejects(Model.findOneAndUpdate({ _id: item._id }, { $set: { image: { url: 'https://example.test/fixture.png' } } }, { runValidators: true }).exec(), { name: 'ValidationError' });
});
