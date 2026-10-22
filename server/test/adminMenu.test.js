import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { afterEach, beforeEach, test } from 'node:test';
import { fixtureOrigin, startRoomFixture } from '../../tests/fixtures/roomServer.js';
import { validateMenuBody } from '../src/routes/adminMenu.js';
import MenuCategory from '../src/models/MenuCategory.js';
import MenuItem from '../src/models/MenuItem.js';

let fixture;
beforeEach(async () => { fixture = await startRoomFixture(); });
afterEach(async () => { await fixture.close(); });
const missing = 'a'.repeat(24);
function request(path, method = 'GET', body, headers = {}) {
  return fetch(`${fixture.url}/api/admin/menu/${path}`, {
    method, headers: {
      Cookie: `manglam_admin_session=${fixture.token}; manglam_admin_csrf=${fixture.csrf}`,
      Origin: fixtureOrigin, 'X-CSRF-Token': fixture.csrf, 'Content-Type': 'application/json', ...headers,
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function create(kind, values) {
  const response = await request(kind, 'POST', values);
  assert.equal(response.status, 201, await response.clone().text());
  return (await response.json()).data;
}
// Keep legacy visibility fixtures explicitly unpublished after API creation.
async function unpublished(kind, values) {
  const body = { ...values }; delete body.isPublished;
  const record = await create(kind, body);
  await request(`${kind}/${record.id}`, 'PATCH', { isPublished: false });
  return { ...record, isPublished: false };
}
const category = (values = {}) => unpublished('categories', { name: 'Fixture category', ...values });
const item = (categoryId, values = {}) => unpublished('items', { name: 'Fixture dish', category: categoryId, ...values });
// Prior archived records are fixtures, not newly archived through DELETE.
function legacyArchive(kind, id) { Object.assign(fixture[kind].get(id), { isArchived: true, isPublished: false }); }

const data = async (path) => (await (await request(path)).json()).data;
const publicData = async (kind) => (await (await fetch(`${fixture.url}/api/menu/${kind}`)).json()).data;

test('all twelve endpoints require active sessions and mutations enforce CSRF, origin and JSON', async () => {
  for (const kind of ['categories', 'items']) {
    const cases = [[kind, 'GET'], [`${kind}/${missing}`, 'GET'], [kind, 'POST', {}], [`${kind}/${missing}`, 'PATCH', {}], [`${kind}/${missing}`, 'DELETE', {}], [`${kind}/${missing}/restore`, 'POST', {}]];
    for (const [path, method, body] of cases) {
      assert.equal((await request(path, method, body, { Cookie: '' })).status, 401);
      if (method === 'GET') continue;
      for (const headers of [{ 'X-CSRF-Token': '' }, { Origin: 'https://untrusted.example' }, { 'Sec-Fetch-Site': 'cross-site' }]) assert.equal((await request(path, method, body, headers)).status, 403);
      assert.equal((await request(path, method, body, { 'Content-Type': 'text/plain' })).status, 415);
    }
  }
  fixture.admin.isActive = false;
  assert.equal((await request('categories')).status, 401);
  assert.equal((await request('items')).status, 401);
});

test('category creation normalizes names, generates safe unique slugs and rejects duplicate names including legacy/archive', async () => {
  const first = await category({ name: '  Fixture   & Category  ', description: ' Line one\nLine two ', displayOrder: 9 });
  assert.equal(first.name, 'Fixture & Category'); assert.equal(first.slug, 'fixture-category');
  assert.equal(first.isPublished, false); assert.equal(first.isArchived, false); assert.equal(first.displayOrder, 9);
  assert.equal(first.description, 'Line one\nLine two'); assert.ok(first.createdAt); assert.ok(first.updatedAt);
  assert.equal(Object.hasOwn(first, 'nameKey'), false);
  const collision = await category({ name: 'Fixture-Category' });
  assert.match(collision.slug, /^fixture-category-[a-f0-9]{12}$/);
  assert.equal((await category({ name: 'भोजन' })).slug, 'category');
  delete fixture.categories.get(first.id).nameKey;
  assert.equal((await request('categories', 'POST', { name: 'fixture & category' })).status, 409);
  legacyArchive('categories', first.id);
  assert.equal((await request('categories', 'POST', { name: first.name })).status, 409);
  assert.equal(fixture.categories.size, 3);
  const concurrent = await Promise.all([request('categories', 'POST', { name: 'Concurrent name' }), request('categories', 'POST', { name: ' concurrent NAME ' })]);
  assert.deepEqual(concurrent.map(({ status }) => status).sort(), [201, 409]);
});

test('category validation rejects mass assignment and edits preserve slugs', async () => {
  for (const body of [null, [], {}, { name: '' }, { name: 'x'.repeat(101) }, { name: 'Valid', description: 'x'.repeat(1001) }, { name: 'Valid', description: null }, { name: 'Valid', slug: 'injected' }, { name: 'Valid', nameKey: 'injected' }, { name: 'Valid', image: {} }, { name: 'Valid', isArchived: true }, { name: 'Valid', isPublished: false }, { name: 'Valid', displayOrder: 1.5 }, { name: 'Valid', displayOrder: -1 }]) assert.equal((await request('categories', 'POST', body)).status, 400);
  const first = await category();
  const other = await category({ name: 'Other category' });
  assert.equal((await request(`categories/${first.id}`, 'PATCH', { name: ' Renamed category ', description: '', displayOrder: 3 })).status, 200);
  const edited = await data(`categories/${first.id}`);
  assert.equal(edited.name, 'Renamed category'); assert.equal(edited.slug, first.slug); assert.equal(edited.displayOrder, 3);
  assert.equal((await request(`categories/${first.id}`, 'PATCH', { name: other.name })).status, 409);
  assert.equal((await request(`categories/${first.id}`, 'PATCH', {})).status, 400);
});

test('menu items validate names, category references, prices and strict field allowlists', async () => {
  const parent = await category();
  for (const values of [{ name: '' }, { name: 'x'.repeat(151) }, { category: 'bad' }, { category: missing }, { category: null }, { price: -1 }, { price: '99' }, { price: true }, { price: 2.001 }, { price: 10000001 }, { vegetarian: 'true' }, { isAvailable: 1 }, { isPublished: false }, { isPublished: 'true' }, { image: {} }, { _id: missing }, { isArchived: true }, { $set: { price: 1 } }, { createdAt: 'date' }]) {
    const response = await request('items', 'POST', { name: 'Fixture dish', category: parent.id, ...values });
    assert.equal(response.status, 400, JSON.stringify(values));
  }
  for (const price of [NaN, Infinity]) assert.throws(() => validateMenuBody({ name: 'Test', category: parent.id, price }, 'items', true), /Price/);
  assert.equal((await request('items', 'POST', { name: 'Missing category' })).status, 400);
  assert.equal(fixture.items.size, 0);
  legacyArchive('categories', parent.id);
  assert.equal((await request('items', 'POST', { name: 'Test', category: parent.id })).status, 409);
});

test('item editing supports optional and zero prices, legacy vegetarian preservation, category selection and preserves image metadata', async () => {
  const parent = await category(); const other = await category({ name: 'Another' });
  const dish = await item(parent.id, { price: 19.90 });
  assert.equal(dish.price, 19.9); assert.equal(dish.isAvailable, true); assert.equal(dish.isPublished, false); assert.equal(dish.isArchived, false);
  const image = { url: 'https://example.test/fixture.jpg', publicId: 'fixture-only', alt: 'Test photograph' };
  fixture.items.get(dish.id).image = image;
  for (const vegetarian of [false, true, null]) {
    fixture.items.get(dish.id).vegetarian = vegetarian;
    assert.equal((await request(`items/${dish.id}`, 'PATCH', { vegetarian })).status, 400);
    assert.equal((await request(`items/${dish.id}`, 'PATCH', { categories: [other.id], name: 'Changed name', description: 'Edited description', displayOrder: 6 })).status, 200);
    const edited = await data(`items/${dish.id}`); assert.equal(edited.vegetarian, undefined); assert.equal(fixture.items.get(dish.id).vegetarian, vegetarian); assert.equal(edited.category, other.id);
    assert.equal(edited.displayOrder, 6); assert.equal(edited.description, 'Edited description');
  }
  for (const price of [null, '', 0, 123.45]) {
    assert.equal((await request(`items/${dish.id}`, 'PATCH', { price })).status, 200);
    assert.equal((await data(`items/${dish.id}`)).price, price === '' ? null : price);
  }
  for (const price of [null, '', undefined]) assert.equal((await item(parent.id, { price })).price, null);
  assert.equal((await item(parent.id)).vegetarian, undefined);
  assert.deepEqual(fixture.items.get(dish.id).image, image);
  for (const body of [{ image: null }, { slug: 'new' }, { category: missing }, { price: -5 }, {}]) assert.equal((await request(`items/${dish.id}`, 'PATCH', body)).status, 400);
});

test('public menu gates both item and parent publication/archive while preserving unavailable dishes', async () => {
  const parent = await category(); const dish = await item(parent.id, { price: 100.25 });
  assert.deepEqual(await publicData('items'), []);
  await request(`items/${dish.id}`, 'PATCH', { isPublished: true });
  assert.deepEqual(await publicData('items'), []);
  await request(`categories/${parent.id}`, 'PATCH', { isPublished: true });
  assert.equal((await publicData('categories')).length, 1);
  assert.equal((await publicData('items'))[0].priceInRupees, 100.25);
  await request(`items/${dish.id}`, 'PATCH', { isAvailable: false });
  let publicItem = (await publicData('items'))[0]; assert.equal(publicItem.isAvailable, false); assert.equal(publicItem.isVegetarian, undefined);
  await request(`items/${dish.id}`, 'PATCH', { price: null });
  publicItem = (await publicData('items'))[0]; assert.equal(Object.hasOwn(publicItem, 'priceInRupees'), false); assert.equal(Object.hasOwn(publicItem, 'isVegetarian'), false);
  await request(`categories/${parent.id}`, 'PATCH', { isPublished: false });
  assert.deepEqual(await publicData('items'), []);
  await request(`categories/${parent.id}`, 'PATCH', { isPublished: true });
  legacyArchive('categories', parent.id);
  assert.deepEqual(await publicData('categories'), []); assert.deepEqual(await publicData('items'), []);
  assert.equal(fixture.items.get(dish.id).isPublished, true); assert.equal(fixture.items.size, 1);
  assert.equal((await request(`categories/${parent.id}`, 'PATCH', { isPublished: true })).status, 409);
  assert.equal((await request(`items/${dish.id}`, 'PATCH', { isPublished: true })).status, 409);
  fixture.categories.get(parent.id).isPublished = true; // Inconsistent legacy archived data remains hidden.
  assert.deepEqual(await publicData('items'), []);
  const restored = await request(`categories/${parent.id}/restore`, 'POST', {});
  assert.equal((await restored.json()).data.isPublished, false); assert.deepEqual(await publicData('items'), []);
  await request(`categories/${parent.id}`, 'PATCH', { isPublished: true });
  await request(`items/${dish.id}`, 'PATCH', { isPublished: false }); assert.deepEqual(await publicData('items'), []);
  await request(`items/${dish.id}`, 'PATCH', { isPublished: true });
  assert.equal((await publicData(`items?category=${parent.id}`)).length, 1);
  const response = await fetch(`${fixture.url}/api/menu/items`); assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('legacy item archive and restore enforce draft and category rules without deleting records', async () => {
  const parent = await category(); const dish = await item(parent.id);
  await request(`items/${dish.id}`, 'PATCH', { isPublished: true });
  legacyArchive('items', dish.id);
  assert.equal(fixture.items.size, 1); assert.equal(fixture.items.get(dish.id).isPublished, false);
  for (const body of [{ isPublished: true }, { name: 'Changed' }, { isAvailable: false }]) assert.equal((await request(`items/${dish.id}`, 'PATCH', body)).status, 409);
  fixture.items.get(dish.id).isPublished = true;
  await request(`categories/${parent.id}`, 'PATCH', { isPublished: true });
  assert.deepEqual(await publicData('items'), []);
  legacyArchive('categories', parent.id);
  assert.equal((await request(`items/${dish.id}/restore`, 'POST', {})).status, 409);
  await request(`categories/${parent.id}/restore`, 'POST', {});
  const restored = (await (await request(`items/${dish.id}/restore`, 'POST', {})).json()).data;
  assert.equal(restored.isPublished, false); assert.equal(restored.isArchived, false);
  assert.equal((await request(`items/${dish.id}/restore`, 'POST', {})).status, 409);
  assert.equal((await request(`categories/${parent.id}/restore`, 'POST', {})).status, 409);
});

test('lists paginate, search literally and filter archive/publication/category/availability including legacy records', async () => {
  const parent = await category(); const other = await category({ name: 'Other', displayOrder: 10 });
  const first = await item(parent.id, { name: 'Fixture [dish]', displayOrder: 5, isAvailable: false });
  const second = await item(other.id, { name: 'Early dish', displayOrder: 0 });
  delete fixture.categories.get(parent.id).isArchived; delete fixture.items.get(first.id).isArchived;
  await request(`items/${first.id}`, 'PATCH', { isPublished: true });
  assert.equal((await data('items?limit=1'))[0].id, second.id);
  assert.equal((await data('items?limit=1&page=2'))[0].id, first.id);
  assert.equal((await data('items?search=%5Bdish%5D'))[0].id, first.id);
  assert.equal((await data('items?availability=unavailable&publication=published'))[0].id, first.id);
  assert.equal((await data(`items?category=${other.id}`))[0].id, second.id);
  assert.equal((await data('items?publication=draft&availability=available'))[0].id, second.id);
  legacyArchive('items', first.id);
  assert.equal((await data('items?status=archived'))[0].id, first.id);
  assert.equal((await data('items?status=all')).length, 2);
  assert.equal((await data('categories?limit=1'))[0].id, parent.id);
  for (const kind of ['categories', 'items']) for (const query of ['?page=0', '?limit=101', '?status=bad', '?publication=bad', '?search=x&search=y', '?unknown=x']) assert.equal((await request(`${kind}${query}`)).status, 400);
  assert.equal((await request('items?category=bad')).status, 400); assert.equal((await request('items?availability=bad')).status, 400);
});

test('invalid/deleted IDs and database failures return safe errors', async () => {
  for (const kind of ['categories', 'items']) {
    for (const [method, suffix, body] of [['GET', '', undefined], ['PATCH', '', { name: 'Edited' }], ['DELETE', '', { confirmPermanentDelete: true }], ['POST', '/restore', {}]]) {
      assert.equal((await request(`${kind}/invalid${suffix}`, method, body)).status, 400);
      assert.equal((await request(`${kind}/${missing}${suffix}`, method, body)).status, method === 'DELETE' ? 200 : 404);
    }
    fixture.state.menuFailure = Object.assign(new Error('private database details'), { name: 'MongoNetworkError' });
    for (const [path, method, body] of [[kind, 'GET'], [kind, 'POST', { name: 'Test', ...(kind === 'items' ? { category: missing } : {}) }], [`${kind}/${missing}`, 'PATCH', { name: 'Edited' }]]) {
      const response = await request(path, method, body); assert.equal(response.status, 503); assert.equal((await response.text()).includes('private'), false);
    }
    fixture.state.menuFailure = new Error('private unexpected details');
    const response = await request(kind); assert.equal(response.status, 500); assert.equal((await response.text()).includes('private'), false);
    fixture.state.menuFailure = null;
  }
});

test('schemas default to unarchived drafts and category names have an indexed uniqueness guard', async () => {
  const parent = new MenuCategory({ name: 'Fixture', slug: 'fixture' }); await parent.validate();
  assert.equal(parent.isArchived, false); assert.equal(parent.isPublished, false);
  const dish = new MenuItem({ name: 'Fixture', category: parent._id }); await dish.validate();
  assert.equal(dish.isArchived, false); assert.equal(dish.isPublished, false); assert.equal(dish.isAvailable, true); assert.equal(dish.vegetarian, undefined);
  assert.ok(MenuCategory.schema.indexes().some(([fields, options]) => fields.nameKey && options.unique && options.partialFilterExpression));
});


test('multiple categories deduplicate IDs, validate every assignment, and preserve legacy data and images', async () => {
  const a = await category(); const b = await category({ name: 'Second fixture category' });
  const dish = await create('items', { name: 'Multi fixture', categories: [a.id, b.id, a.id.toUpperCase()], tags: ['  CURRY ', 'curry', '  mild   spice '] });
  assert.deepEqual(dish.categories, [a.id, b.id]); assert.deepEqual(dish.tags, ['curry', 'mild spice']);
  assert.equal((await request(`items/${dish.id}`, 'PATCH', { category: a.id })).status, 409);
  assert.deepEqual(fixture.items.get(dish.id).categories, [a.id, b.id]);
  const image = { url: 'https://ik.imagekit.io/fixture/dish.jpg', fileId: 'retained-id', filePath: `/manglam-hotel/restaurant/${dish.id}/dish.jpg`, alt: 'Retained photo' };
  Object.assign(fixture.items.get(dish.id), { image, price: 123.45, vegetarian: false });
  const createdAt = fixture.items.get(dish.id).createdAt;
  assert.equal((await request(`items/${dish.id}`, 'PATCH', { categories: [b.id], tags: [] })).status, 200);
  let stored = fixture.items.get(dish.id);
  assert.deepEqual(stored.image, image); assert.equal(stored.price, 123.45); assert.equal(stored.vegetarian, false);
  assert.deepEqual(stored.createdAt, createdAt); assert.deepEqual(stored.categories, [b.id]); assert.equal(stored.category, b.id);
  assert.equal((await data(`items?category=${a.id}`)).length, 0); assert.equal((await data(`items?category=${b.id}`)).length, 1);
  stored = fixture.items.get(dish.id);
  delete stored.categories; // Actual legacy shape, read without backfill or timestamp changes.
  const snapshot = structuredClone(stored);
  assert.deepEqual((await data(`items/${dish.id}`)).categories, [b.id]);
  assert.deepEqual(fixture.items.get(dish.id), snapshot);
  assert.equal((await request(`items/${dish.id}`, 'PATCH', { tags: ['legacy'] })).status, 200);
  assert.equal(fixture.items.get(dish.id).categories, undefined);
});

test('category arrays and tags reject malformed data, empty tags, operators and obsolete vegetarian writes', async () => {
  const parent = await category();
  for (const categories of [undefined, [], null, 'invalid', [missing], ['invalid'], [null], [{ $ne: null }], Array(51).fill(parent.id)]) {
    assert.equal((await request('items', 'POST', { name: 'Invalid fixture', categories })).status, 400);
  }
  for (const tags of [null, 'tag', [''], ['   '], [1], [{ $gt: '' }], ['x'.repeat(41)], Array(16).fill('tag')]) {
    assert.equal((await request('items', 'POST', { name: 'Invalid fixture', categories: [parent.id], tags })).status, 400);
  }
  for (const vegetarian of [true, false, null]) assert.equal((await request('items', 'POST', { name: 'Invalid fixture', categories: [parent.id], vegetarian })).status, 400);
  assert.equal((await request('items', 'POST', { name: 'Ambiguous fixture', categories: [parent.id], category: parent.id })).status, 400);
  const dish = await create('items', { name: 'Valid fixture', categories: [parent.id] });
  legacyArchive('categories', parent.id);
  assert.equal((await request(`items/${dish.id}`, 'PATCH', { categories: [parent.id] })).status, 409);
  assert.equal((await request(`items/${dish.id}`, 'PATCH', { isPublished: true })).status, 409);
});

test('public membership is per published category, with legacy fallback, deduplication, search and pagination', async () => {
  const a = await category({ isPublished: false }); const b = await category({ name: 'Other fixture' });
  for (const parent of [a, b]) await request(`categories/${parent.id}`, 'PATCH', { isPublished: true });
  const first = await create('items', { name: 'Fixture Paneer', categories: [a.id, b.id], tags: ['Matar', 'mild spice'], displayOrder: 1 });
  const second = await item(b.id, { name: 'Another fixture', tags: ['paneer'], displayOrder: 2 });
  delete fixture.items.get(second.id).categories;
  for (const dish of [first, second]) await request(`items/${dish.id}`, 'PATCH', { isPublished: true });
  assert.equal((await publicData('items')).length, 2);
  assert.deepEqual((await publicData(`items?category=${a.id}`))[0].categoryIds, [a.id, b.id]);
  assert.equal((await publicData('items?search=PaNeEr')).length, 2);
  assert.equal((await publicData('items?search=%20MILD%20%20%20SPICE%20'))[0].id, first.id);
  assert.equal((await publicData(`items?category=${a.id}&search=paneer`)).length, 1);
  assert.equal((await publicData('items?search=.*')).length, 0);
  assert.equal((await publicData('items?search=paneer&limit=1&page=2'))[0].id, second.id);
  const response = await (await fetch(`${fixture.url}/api/menu/items?search=paneer&limit=1`)).json();
  assert.equal(response.pagination.total, 2); assert.equal(response.pagination.totalPages, 2);
  await request(`categories/${a.id}`, 'PATCH', { isPublished: false });
  assert.deepEqual((await publicData('items'))[0].categoryIds, [b.id]);
  assert.equal((await publicData(`items?category=${a.id}`)).length, 0);
  legacyArchive('categories', b.id); assert.deepEqual(await publicData('items'), []);
  await request(`categories/${a.id}`, 'PATCH', { isPublished: true });
  assert.equal((await publicData('items')).length, 1);
  legacyArchive('items', first.id); assert.deepEqual(await publicData('items'), []);
  assert.equal(fixture.items.size, 2);
});

test('explicit categories override stale legacy membership and empty arrays never revive it', async () => {
  const a = await category(); const b = await category({ name: 'Hidden fixture' });
  await request(`categories/${a.id}`, 'PATCH', { isPublished: true });
  const dish = await item(a.id); Object.assign(fixture.items.get(dish.id), { categories: [b.id], isPublished: true });
  assert.deepEqual(await publicData('items'), []);
  assert.equal((await data(`items?category=${a.id}`)).length, 0);
  fixture.items.get(dish.id).categories = []; assert.deepEqual(await publicData('items'), []);
  delete fixture.items.get(dish.id).categories; assert.equal((await publicData('items')).length, 1);
});

test('public search rejects unbounded, repeated and unknown queries while admin search includes tags', async () => {
  const parent = await category(); const dish = await item(parent.id, { tags: ['special'] });
  assert.equal((await data('items?search=SPECIAL'))[0].id, dish.id);
  assert.equal((await data(`items?category=${parent.id}&search=SPECIAL`))[0].id, dish.id);
  for (const query of ['search=' + 'x'.repeat(151), 'search=a&search=b', 'search[$ne]=x', 'category=bad', 'limit=101', 'page=0', 'unknown=1']) {
    assert.equal((await fetch(`${fixture.url}/api/menu/items?${query}`)).status, 400);
  }
  const document = new MenuItem({ name: 'Fixture', categories: [parent.id], tags: ['valid'] }); await document.validate();
  await assert.rejects(new MenuItem({ name: 'Fixture', categories: [] }).validate());
  await assert.rejects(new MenuItem({ name: 'Fixture', categories: [parent.id], tags: ['duplicate', 'duplicate'] }).validate());
  assert.ok(MenuItem.schema.indexes().some(([fields]) => fields.categories && fields.isPublished));
});


test('installed Mongoose casts category arrays in atomic updates without touching image or legacy dietary fields', async () => {
  const isolated = new mongoose.Mongoose();
  const Model = isolated.model('MenuItemQueryFixture', MenuItem.schema.clone());
  const id = '123456789012345678901234';
  let captured;
  Model.collection.findOneAndUpdate = async (_filter, update) => {
    captured = update;
    return { _id: new mongoose.Types.ObjectId(id), name: 'Fixture', ...update.$set };
  };
  const result = await Model.findOneAndUpdate({ _id: id }, { $set: { categories: [id], category: id, tags: ['normalized'] } }, { returnDocument: 'after', runValidators: true }).lean();
  assert.equal(result.categories[0].toHexString(), id);
  assert.ok(captured.$set.categories[0] instanceof mongoose.Types.ObjectId);
  assert.equal(captured.$set.image, undefined); assert.equal(captured.$set.vegetarian, undefined);
  assert.equal(captured.$unset, undefined);
  await assert.rejects(Model.findOneAndUpdate({ _id: id }, { $set: { categories: [] } }, { runValidators: true }).exec(), { name: 'ValidationError' });
});
