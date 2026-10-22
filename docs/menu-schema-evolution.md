# Restaurant categories, tags and search

This change is local only. No Atlas data, credentials, ImageKit assets, commits,
pushes or deployments are part of this work. Use isolated fixtures to validate it.

## Contracts and compatibility

- Manglam Restaurant is **100% Pure Vegetarian**. The public page displays this
  once. Admin/public cards omit per-dish indicators. `vegetarian` is rejected in
  new write bodies and omitted from API responses. The legacy schema field and
  stored values are retained unchanged; no cleanup is required.
- `MenuItem.categories` is an authoritative array of 1–50 unique category
  ObjectIds. Every assignment must reference an existing, nonarchived category;
  drafts may be selected. Creation, reassignment, publication and restoration
  validate references. Archives never cascade to dishes.
- When `categories` is absent, reads use `[category]`. An explicit empty array
  does not fall back to a stale legacy category. Reads never write or change
  timestamps. New/edited assignments also maintain `category` as the first ID
  for rollback reads; other edits leave legacy associations untouched.
- Admin responses include `categories`, `tags`, and a deprecated first-ID
  `category` alias. Deprecated single-category writes normalize to an array,
  but cannot replace an existing multi-category assignment (409). Supplying both
  fields is rejected. Refresh old admin tabs before editing after rollout.
- Tags default to an empty response array, with no automatic production tags.
  Shared frontend/backend validation limits input to 15 strings, each 1–40
  characters after Unicode/whitespace normalization. Tags are lowercased and
  deduplicated. Empty strings, objects, operators as fields, and malformed types
  are rejected. `tags: []` clears tags. Tags are plain text, not query expressions.
- Updates remain allowlisted `$set`/`$unset` operations. Prices, images, ImageKit
  IDs/URLs, image versions/cleanup queues, creation dates and legacy vegetarian
  fields are untouched by category/tag changes. Normal saves update `updatedAt`.
  No aggregation pipeline was added; existing Mongoose 9 photo behavior remains.

## Public behavior and query bounds

`GET /api/menu/items?category=<id>&search=<text>&page=1&limit=50` supports the
existing pagination (maximum 100) and literal, case-insensitive partial name/tag
search. Search is capped at 150 input characters, Unicode-normalized, trimmed,
whitespace-collapsed and regex-escaped. Repeated/unknown parameters are rejected.
Item list and count queries have a 3-second database execution limit. This is
bounded substring regex search, not a full-text search engine; large future menus
may need a separately designed search index. No compound parallel-array index
combines `tags` and `categories`.

Only published, nonarchived dishes with at least one published, nonarchived
category are returned. `categoryIds` includes eligible memberships only, plus a
deprecated first-ID `categoryId` alias. Filtering by a hidden category returns
no dishes, even when the dish is visible elsewhere. Each database record appears
once in paginated results/counts. Unavailability remains independent.

The browser reuses the existing all-pages fetch and filters the loaded snapshot
without per-keystroke requests. All Items/search results deduplicate by ID and
retain API order. Selecting either category shows a shared dish once. Clearing
search keeps the chosen category and returns focus to the input. Reload/navigation
fetches fresh content; no live publication-update guarantee is introduced.

## Migration and indexes

**No migration is necessary.** The compatibility reader handles old and new
records together. No startup backfill, rewrite, unset or destructive migration
is added. The existing startup index initializer will add two nonunique multikey
indexes when an operator eventually deploys/restarts this version:

```javascript
{ isPublished: 1, isArchived: 1, categories: 1, displayOrder: 1, _id: 1 }
{ isArchived: 1, categories: 1, displayOrder: 1, _id: 1 }
```

Legacy category indexes remain for fallback queries and rollback. Index creation
has not been run against Atlas. Review dataset size and index-build capacity before
deployment; sorting a multikey query may still require a sort stage. Check plans
on a staging copy with representative data before a large rollout.

If an operator later explicitly approves optional backfill, take a restorable
Atlas snapshot, test on a clone, pause admin edits and verify the database name
and actual collection name first. These **manual mongosh examples have not been
executed**; never paste credentials into project files or logs:

```javascript
const hotel = db.getSiblingDB('manglam_hotel');
const legacy = { categories: { $exists: false }, category: { $type: 'objectId' } };
hotel.menuitems.countDocuments(legacy); // Review count and sampled records first.
// Only after separate approval and backup verification:
hotel.menuitems.updateMany(legacy, [{ $set: { categories: ['$category'] } }]);
```

The filter is idempotent and never overwrites an existing array; the raw update
preserves IDs, images, prices and timestamps. Missing/invalid legacy category
references require individual operator review, not automatic guessing. When
performing a pipeline through Mongoose 9 instead of mongosh, explicitly set
`updatePipeline: true` and `timestamps: false`; pipeline values bypass casting.

For rollback, freeze admin edits first. Retain the additive fields and indexes;
the older application can read the retained first-category bridge but cannot
represent all memberships. Do not edit multi-category dishes with old software.
Prefer restoring this compatible reader/fixing forward. A full backup restore
requires reconciliation of edits made after the snapshot; never blanket-unset
`categories` to roll back. Optional removal of obsolete `vegetarian` fields is
a separate reviewed migration and is not needed for this release.

## Validation and manual verification

Run `npm run check`, `npm run test:e2e`, and `git diff --check`. API/browser tests
use isolated in-memory persistence with real Express/auth/Mongoose validation
and mocked ImageKit. They never connect to Atlas or upload/delete real media.
They do not verify real MongoDB query plans or Atlas index creation.

Before approving a Render deployment, on a staging database copy:

1. Open a legacy dish and confirm its category, image and price load unchanged.
2. Select two approved categories, add/remove tags, and save. Confirm both names
   in the admin list and filtering by either category. Confirm no dietary toggle.
3. Publish the approved dish/categories. Check both category filters and All Items;
   the dish must appear once per view. Verify photos, price and availability.
4. Search using mixed case, partial names, tags and extra whitespace. Combine
   search with category filters; check an empty result and Clear search.
5. Unpublish/archive one category; confirm the dish remains visible through the
   other. Hide both or hide the dish; confirm it disappears. Restore as a draft.
6. Verify the single Pure Vegetarian label, keyboard checkbox/tag controls,
   image fallbacks and layout at 360, 393, 768, 1024 and 1440px.
7. Refresh admin tabs, inspect additive index creation and compare representative
   public API responses before approving deployment. Re-fetch origin/main and
   reconcile remote changes without discarding local work.

## File inventory

Validation completed locally: `npm run check` passed (99 backend tests, lint and
production build); `npm run test:e2e` passed (74 browser tests); `git diff --check`
passed. Mobile editor and desktop restaurant screenshots were visually reviewed.
Git status was clean at inspection. Cached main/origin/main both pointed to
`b5b711b`; two fetch attempts failed because github.com:443 was unreachable, so
current upstream freshness is unverified. No commit, push or deployment occurred.

Created:

- `client/src/components/admin/MenuCategoriesEditor.jsx`
- `client/src/components/admin/MenuTagsEditor.jsx`
- `docs/menu-schema-evolution.md`
- `server/src/utils/menu.js`
- `shared/menu.js`
- `tests/e2e/menuSearch.spec.js`

Modified:

- `AGENTS.md`
- `README.md`
- `client/src/components/admin/MenuRecordCard.jsx`
- `client/src/components/admin/MenuRecordForm.jsx`
- `client/src/components/restaurant/MenuItemCard.jsx`
- `client/src/components/restaurant/MenuListing.jsx`
- `client/src/data/menu.js`
- `client/src/pages/AdminRestaurantPage.jsx`
- `client/src/pages/RestaurantPage.jsx`
- `client/src/services/api.js`
- `client/src/styles/admin-menu.css`
- `client/src/styles/restaurant.css`
- `docs/admin-restaurant.md`
- `server/src/models/MenuItem.js`
- `server/src/routes/adminMenu.js`
- `server/src/routes/publicContent.js`
- `server/test/adminMenu.test.js`
- `server/test/adminMenuImages.test.js`
- `server/test/app.test.js`
- `tests/e2e/adminMenuImages.spec.js`
- `tests/e2e/adminRestaurant.spec.js`
- `tests/e2e/restaurant.spec.js`
- `tests/fixtures/roomServer.js`
