import assert from 'node:assert/strict';
import { beforeEach, afterEach, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { startRoomFixture, fixtureOrigin } from '../../tests/fixtures/roomServer.js';
import { processMenuImageCleanup, menuCleanupRecord } from '../src/services/menuImageCleanup.js';

let fixture;
beforeEach(async () => { fixture = await startRoomFixture(); });
afterEach(async () => { await fixture.close(); });
const confirmation = { confirmPermanentDelete: true };
const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#ffffff' } }).png().toBuffer();
const headers = () => ({ Cookie: `manglam_admin_session=${fixture.token}; manglam_admin_csrf=${fixture.csrf}`, Origin: fixtureOrigin, 'X-CSRF-Token': fixture.csrf });
const request = (path, method = 'GET', body, overrides = {}) => fetch(`${fixture.url}/api/admin/menu/${path}`, {
  method, headers: { ...headers(), 'Content-Type': 'application/json', ...overrides }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
async function add(kind, body) {
  const result = await request(kind, 'POST', body);
  assert.equal(result.status, 201, await result.clone().text());
  return (await result.json()).data;
}
const category = (name = 'Fixture category') => add('categories', { name });
const item = (ids, extra = {}) => add('items', { name: 'Fixture dish', categories: ids, ...extra });
const remove = (kind, id) => request(`${kind}/${id}`, 'DELETE', confirmation);
const publicItems = async () => (await (await fetch(`${fixture.url}/api/menu/items`)).json()).data;
const owned = (id, suffix = 'current') => ({ fileId: `fixture-${suffix}`, filePath: `/manglam-hotel/restaurant/${id}/${suffix}.png`, url: `https://ik.imagekit.io/fixture/${suffix}.png`, alt: 'Fixture image' });
const cleanup = () => processMenuImageCleanup({ models: fixture.models, imageStorage: fixture.imageStorage });
async function upload(id, method = 'POST', version = 0) {
  const body = new FormData(); body.append('image', new Blob([png], { type: 'image/png' }), 'fixture.png');
  body.append('version', String(version)); body.append('operationId', randomUUID());
  return fetch(`${fixture.url}/api/admin/menu/items/${id}/image`, { method, headers: headers(), body });
}
function pauseNextCommit() {
  let resume; let entered;
  const gate = new Promise((resolve) => { resume = resolve; });
  const waiting = new Promise((resolve) => { entered = resolve; });
  fixture.state.beforeMenuCommit = async () => { fixture.state.beforeMenuCommit = null; entered(); await gate; };
  return { waiting, resume };
}

test('API creation publishes categories and eligible multi-category dishes without changing legacy records', async () => {
  const legacy = await fixture.models.MenuCategory.create({ name: 'Legacy', slug: 'legacy', isPublished: false });
  const a = await category(); const b = await category('Second fixture');
  const dish = await item([a.id, b.id], { tags: ['  MILD '], price: 15.25 });
  assert.equal(a.isPublished, true); assert.equal(dish.isPublished, true);
  assert.deepEqual((await publicItems())[0].categoryIds, [a.id, b.id]);
  assert.equal(fixture.categories.get(legacy._id).isPublished, false);
  for (const kind of ['categories', 'items']) {
    assert.equal((await request(kind, 'POST', { name: 'Cannot create hidden', ...(kind === 'items' ? { categories: [a.id] } : {}), isPublished: false })).status, 400);
  }
  await request(`categories/${a.id}`, 'PATCH', { isPublished: false });
  assert.deepEqual((await publicItems())[0].categoryIds, [b.id]);
});

test('permanent deletion requires explicit consent, active auth, CSRF, exact origin and strict bodies', async () => {
  const parent = await category(); const dish = await item([parent.id]);
  for (const [kind, id] of [['items', dish.id], ['categories', parent.id]]) {
    for (const body of [{}, { confirmPermanentDelete: false }, { confirmPermanentDelete: 'true' }, { ...confirmation, image: {} }]) assert.equal((await request(`${kind}/${id}`, 'DELETE', body)).status, 400);
    for (const [overrides, status] of [[{ Cookie: '' }, 401], [{ 'X-CSRF-Token': '' }, 403], [{ Origin: 'https://untrusted.test' }, 403], [{ 'Sec-Fetch-Site': 'cross-site' }, 403]]) assert.equal((await request(`${kind}/${id}`, 'DELETE', confirmation, overrides)).status, status);
    assert.equal((await request(`${kind}/${id}?force=true`, 'DELETE', confirmation)).status, 400);
    assert.equal((await remove(kind, 'bad')).status, 400);
  }
  assert.equal(fixture.items.size, 1); assert.equal(fixture.categories.size, 1);
});

test('permanent dish deletion is idempotent, includes archived records and removes all public memberships', async () => {
  const a = await category(); const b = await category('Second'); const dish = await item([a.id, b.id]);
  const results = await Promise.all([remove('items', dish.id), remove('items', dish.id)]);
  assert.deepEqual(results.map(({ status }) => status), [200, 200]);
  assert.equal(fixture.items.has(dish.id), false); assert.deepEqual(await publicItems(), []);
  const old = await fixture.models.MenuItem.create({ name: 'Old archived', category: a.id, isArchived: true });
  assert.equal((await remove('items', old._id)).status, 200); assert.equal(fixture.items.size, 0);
  assert.equal(fixture.categories.size, 2);
  assert.equal((await request(`items/${dish.id}`, 'PATCH', { name: 'Resurrect' })).status, 404);
});

test('category deletion refuses all modern, legacy, stale and archived references before deleting unused categories', async () => {
  const a = await category(); const b = await category('Second'); const dish = await item([a.id, b.id]);
  let response = await remove('categories', a.id); assert.equal(response.status, 409); assert.match((await response.json()).error.message, /Reassign or delete/);
  await request(`items/${dish.id}`, 'PATCH', { categories: [b.id] });
  const old = await fixture.models.MenuItem.create({ name: 'Old archived', category: a.id, isArchived: true });
  assert.equal((await remove('categories', a.id)).status, 409);
  fixture.items.get(old._id).categories = [b.id]; // A stale legacy category is still a stored reference.
  assert.equal((await remove('categories', a.id)).status, 409);
  await remove('items', old._id);
  fixture.categories.get(a.id).isArchived = true;
  assert.equal((await remove('categories', a.id)).status, 200);
  assert.equal((await remove('categories', a.id)).status, 200);
  assert.equal(fixture.categories.has(a.id), false);
  assert.deepEqual(fixture.items.get(dish.id).categories, [b.id]);
});

test('category deletion racing creation or reassignment cannot commit an orphan in either order', async () => {
  const a = await category(); const b = await category('Second');
  let pause = pauseNextCommit();
  const deleting = remove('categories', a.id); await pause.waiting;
  const dish = await item([a.id, b.id]); pause.resume();
  assert.equal((await deleting).status, 409); assert.equal(fixture.categories.has(a.id), true);
  const c = await category('Third');
  pause = pauseNextCommit();
  const editing = request(`items/${dish.id}`, 'PATCH', { categories: [c.id, b.id] }); await pause.waiting;
  assert.equal((await remove('categories', c.id)).status, 200); pause.resume();
  assert.equal((await editing).status, 400);
  assert.deepEqual(fixture.items.get(dish.id).categories, [a.id, b.id]);
});

test('cleanup persistence failure rolls back the entire deletion and never calls ImageKit', async () => {
  const parent = await category(); const dish = await item([parent.id]);
  const photo = owned(dish.id); fixture.items.get(dish.id).image = photo;
  fixture.state.cleanupPersistenceFailure = true;
  assert.equal((await remove('items', dish.id)).status, 503);
  assert.deepEqual(fixture.items.get(dish.id).image, photo); assert.equal(fixture.cleanupJobs.size, 0);
  assert.deepEqual(fixture.storageState.deletions, []);
  fixture.state.cleanupPersistenceFailure = false;
  assert.equal((await remove('items', dish.id)).status, 200);
  assert.deepEqual(fixture.storageState.deletions, [photo.fileId]);
});

test('failed ImageKit deletion keeps current and prior cleanup metadata in durable jobs after dish deletion', async () => {
  const parent = await category(); const dish = await item([parent.id]);
  const current = owned(dish.id); const previous = owned(dish.id, 'previous');
  Object.assign(fixture.items.get(dish.id), { image: current, pendingImageCleanup: [menuCleanupRecord(previous), menuCleanupRecord(current)] });
  fixture.storageState.failDelete = true;
  const response = await remove('items', dish.id); assert.equal(response.status, 202);
  assert.equal((await response.json()).data.cleanupPending, true);
  assert.equal(fixture.items.has(dish.id), false); assert.equal(fixture.cleanupJobs.size, 2);
  fixture.storageState.failDelete = false; fixture.state.cleanupClearFailure = true;
  await cleanup(); assert.equal(fixture.cleanupJobs.size, 2);
  fixture.state.cleanupClearFailure = false;
  fixture.imageStorage.delete = async () => { throw { status: 404 }; }; // Already removed before failed acknowledgement.
  await cleanup(); assert.equal(fixture.cleanupJobs.size, 0);
  assert.equal((await remove('items', dish.id)).status, 200);
});

test('unverified legacy metadata survives for review and no other dish or room media is deleted', async () => {
  const parent = await category(); const dish = await item([parent.id]); const other = await item([parent.id], { name: 'Other dish' });
  const shared = owned(dish.id);
  fixture.items.get(dish.id).image = shared;
  fixture.items.get(other.id).image = { ...shared, filePath: `/manglam-hotel/restaurant/${other.id}/fixture.png` };
  fixture.items.get(dish.id).pendingImageCleanup = [menuCleanupRecord({ fileId: 'room-file', filePath: '/manglam-hotel/rooms/other/file.png' })];
  assert.equal((await remove('items', dish.id)).status, 202);
  assert.deepEqual(fixture.storageState.deletions, []); assert.equal(fixture.cleanupJobs.size, 2);
  assert.ok([...fixture.cleanupJobs.values()].some((job) => job.requiresReview));
  const legacy = await item([parent.id], { name: 'Legacy photo' });
  fixture.items.get(legacy.id).image = { url: 'https://example.test/old.jpg', publicId: 'legacy-only' };
  assert.equal((await remove('items', legacy.id)).status, 202);
  assert.ok([...fixture.cleanupJobs.values()].some((job) => job.asset.publicId === 'legacy-only' && job.requiresReview));
});

test('an in-flight upload finishing after permanent deletion creates a standalone cleanup job', async () => {
  const parent = await category(); const dish = await item([parent.id]);
  let started; const waiting = new Promise((resolve) => { started = resolve; });
  fixture.storageState.delayMs = 150;
  fixture.storageState.onUploadStart = started;
  const uploading = upload(dish.id); await waiting;
  assert.equal((await remove('items', dish.id)).status, 200);
  fixture.storageState.failDelete = true;
  assert.equal((await uploading).status, 409);
  assert.equal(fixture.items.has(dish.id), false); assert.equal(fixture.cleanupJobs.size, 1);
  fixture.storageState.failDelete = false; await cleanup();
  assert.equal(fixture.cleanupJobs.size, 0);
});

test('deletion retries after a concurrent photo replacement and transfers the latest photo metadata', async () => {
  const parent = await category(); const dish = await item([parent.id]); await upload(dish.id);
  const pause = pauseNextCommit(); const deleting = remove('items', dish.id); await pause.waiting;
  assert.equal((await upload(dish.id, 'PUT', 1)).status, 200);
  pause.resume(); assert.equal((await deleting).status, 200);
  assert.equal(fixture.items.has(dish.id), false);
  assert.deepEqual(new Set(fixture.storageState.deletions), new Set(['fixture-file-1', 'fixture-file-2']));
});

test('unknown transaction acknowledgement is safely retried with durable jobs and no duplicated dish', async () => {
  const parent = await category(); const dish = await item([parent.id]);
  fixture.items.get(dish.id).image = owned(dish.id);
  fixture.state.lostMenuCommitAcknowledgement = true;
  assert.equal((await remove('items', dish.id)).status, 503);
  assert.equal(fixture.items.has(dish.id), false); assert.equal(fixture.cleanupJobs.size, 1);
  assert.deepEqual(fixture.storageState.deletions, []);
  assert.equal((await remove('items', dish.id)).status, 200); assert.equal(fixture.cleanupJobs.size, 0);
});
