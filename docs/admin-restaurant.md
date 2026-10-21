# Restaurant administration

Run `npm run dev` from the repository root, sign in at
`http://127.0.0.1:5173/admin/login`, and select **Restaurant Management**.
Categories live at `/admin/restaurant`; dishes at `/admin/restaurant/items`.
Add/edit routes are `/admin/restaurant/categories/new`,
`/admin/restaurant/categories/:id/edit`, `/admin/restaurant/items/new`, and
`/admin/restaurant/items/:id/edit`. All are inside the existing admin guard/layout.

## Behavior and validation

- Both lists support literal name search, pagination (12 per UI page), archive
  and publication filters. Dishes also filter by category and availability.
- Categories: required normalized name (1–100 characters), description (up to
  1000), display order (integer 0–100000), generated unique slug, publication.
  Names normalize Unicode, trim and collapse whitespace. Duplicate names are
  rejected case-insensitively, including archived names. Existing slugs remain
  stable on rename. Slug collisions retry with random suffixes without overwrites;
  non-Latin names with no ASCII slug use `category` as the base.
- Dishes: required name (1–150), description (up to 3000), required category,
  optional INR price (0–10000000, at most two decimals), optional vegetarian
  true/false, availability, display order (integer 0–100000), publication.
  `null`/empty-string price clears it. `null` vegetarian clears the indicator.
  Prices remain Numbers in INR major units to preserve the public API contract;
  writes reject excess fractional precision and normalize to two decimals.
- New records are always drafts. Dish availability defaults to true. Publication
  is a separate deliberate confirmation, never a side effect of saving details.
- Archived records cannot be edited/published. Archive atomically sets archived
  true and published false; restore sets both false. No permanent deletion exists.
- Category references are checked on dish creation, category assignment,
  publication and restoration. Archived/missing categories are rejected. Restore
  a dish's category first. An existing active dish can still be unpublished or
  archived if its category has been archived; editing can select a new category.
- Category archive/unpublication does not change or delete associated dishes.
  Their own publication/availability state is retained. Restoring a category
  leaves it a draft. Republishing it reveals its already-published, active dishes.
- Public menu responses require both category and dish to be published and
  nonarchived. Responses use `Cache-Control: no-store`. Already-open pages get
  changes on reload/navigation, with no realtime push or availability guarantees.
- Unavailable published dishes remain visible with **Currently unavailable**.
  Missing price shows **Price on request**. Only verified true vegetarian status
  gets the existing public vegetarian badge; false and unspecified show none.
  The public menu remains view-only, without ordering or reservations.
- Each saved menu item supports one optional ImageKit photo. New items must be
  saved before photo upload. Photo changes use a separate protected endpoint;
  generic menu writes do not accept image metadata or arbitrary URLs.
- JPEG, PNG and WebP uploads are limited to 5 MB, signature-checked and decoded
  before upload (maximum 40 megapixels). Missing photos use a public placeholder.
- Replacements require the photo version read by the editor. New metadata and a
  cleanup record for the previous managed asset commit atomically; deletion
  occurs only after that database change succeeds. Failed remote deletions are
  retried by the room ImageKit cleanup worker. Legacy/unmanaged media is retained.
- Photo alternative text can be updated independently. Unavailable or unpublished
  dishes retain their existing publication and availability behavior.
- Forms retain failed-save values, prevent duplicate submission, support cancel,
  and warn on unsaved navigation. Values are not persisted across session expiry
  or forced refresh. Confirmation dialogs retain the existing keyboard behavior.

## API

Each base below exposes the same six authenticated routes:

| Base | Model |
| --- | --- |
| `/api/admin/menu/categories` | MenuCategory |
| `/api/admin/menu/items` | MenuItem |

| Method and suffix | Behavior |
| --- | --- |
| GET base | Paginated list |
| GET `/:id` | Detail, including archived records |
| POST base | Create unpublished draft (201) |
| PATCH `/:id` | Allowlisted field changes on active records |
| DELETE `/:id` | Soft archive and unpublish |
| POST `/:id/restore` | Restore to draft |

Mutations require JSON and existing active-session, session-bound CSRF, allowed
origin and same-site checks. Archive/restore bodies are `{}`. Only validated
fields enter `$set`/`$unset`; IDs, slugs, nameKey, images, archive flags, timestamps
and MongoDB operators are not writable through generic bodies. Invalid IDs and
input return 400, unauthenticated 401, CSRF/origin 403, missing records 404,
duplicate/status conflicts 409, wrong content type 415, unavailable DB 503.
Unexpected errors return a generic 500 without internal details.

List queries: `page`, `limit` (maximum 100), `search` (maximum 150),
`status=active|archived|all`, `publication=all|draft|published`.
Items additionally accept `category=<ObjectId>` and
`availability=all|available|unavailable`. Category selectors retrieve all pages
through this bounded API. Lists return `{data, pagination}`; writes/detail return
`{data}`. Unsupported query filters and body fields are rejected.

### Protected menu photo API

All photo routes require the active admin session. Mutations also require the
existing exact-origin, same-site and session-bound CSRF checks. Requests reject
unsupported query parameters and archived menu items.

| Method | Endpoint | Request | Behavior |
| --- | --- | --- | --- |
| GET | `/api/admin/menu/items/:id/image` | — | Return current image and version |
| POST | `/api/admin/menu/items/:id/image` | Multipart `image`, `alt`, `version`, `operationId` | Upload the first image |
| PUT | `/api/admin/menu/items/:id/image` | Same multipart fields | Replace the existing image |
| PATCH | `/api/admin/menu/items/:id/image` | JSON `{version, operationId, alt}` | Update alternative text |
| DELETE | `/api/admin/menu/items/:id/image` | JSON `{version, operationId}` | Remove the image |

Upload and replace accept exactly one file and validate its declared type,
signature, and decoded raster data. The server stores ImageKit `fileId`, URL,
path and alt text on the item under
`/manglam-hotel/restaurant/<item-id>/`; clients cannot supply asset IDs or
remote URLs. Version compare-and-set and operation IDs prevent stale commits
and duplicate retries. A failed ImageKit upload leaves the current image
unchanged. When persistence is uncertain, uploaded assets are retained for
recovery; never delete them until checking the item's metadata. The cleanup
queue only deletes assets whose stored path belongs to the same menu item and
which are no longer referenced as that item's current image.

## Schema and production data

Both models add `isArchived: false` and archive/order indexes. Categories add
internal `nameKey` with a partial unique index for string keys; the existing
unique slug index remains. The existing startup index initialization creates
these indexes when the operator starts the server. No index/record changes were
performed on Atlas by development tests. Mongoose 9.11.2 is unchanged.

Legacy records lacking isArchived are treated as active. No backfill is needed:
the name key is assigned on creation/rename, while the API checks existing names
as well. Pre-existing legacy duplicates are not automatically merged or deleted;
an operator can rename them individually. Unique-index behavior is mocked in
tests; live Atlas index creation/connectivity still needs operator verification.

## Validation and manual checks

```powershell
npm run check
npm run test:e2e
```

Backend and browser tests use `tests/fixtures/roomServer.js`, real Express/auth
handlers and Mongoose validation with in-memory menu persistence. All browser
API calls are redirected to the fixture. No real credentials, rooms, menu records
or ImageKit assets are used or modified, and no `.env` file is loaded by tests.
Responsive coverage includes 360, 393, 768, 1024 and 1440px, with screenshots in
ignored `test-results/`.

For manual checks, use only approved hotel menu content:

1. Start the app, sign in, open Restaurant Management, and add a category draft.
   Edit its name/description/order and verify the slug remains stable.
2. Open Menu Items and add a dish under that category. Try a blank name and
   negative price, then enter verified content and save the draft.
3. Publish the dish while the category is draft; reload `/restaurant` and verify
   it stays hidden. Publish the category and verify the dish and category filter.
4. Edit price and vegetarian status, then clear them; verify Price on request
   and absence of the vegetarian badge. Mark unavailable and verify its label.
5. Unpublish the category and verify its dishes disappear. Archive and restore
   the category; confirm it remains unpublished and dishes are retained.
6. Archive/restore a dish; confirm restoration leaves a draft. Cancel an archive
   dialog with Escape and verify keyboard focus returns to the action button.
7. Search/filter both lists, navigate pagination, and check the item form on a
   mobile viewport. Make an unsaved edit, cancel navigation, and verify retention.
8. Sign out and open any admin restaurant URL; verify the login redirect.
9. For a photo check, use an existing saved dish and an approved JPEG, PNG or
   WebP photo no larger than 5 MB. Open **Edit item**, select the photo, add
   descriptive alternative text, and upload. Verify the preview and public
   `/restaurant` listing. Try changing the alternative text, replacing the
   photo, and removing it only after confirming the removal dialog.
10. Confirm that `/restaurant` uses the uploaded image with its alt text while
    retaining menu filtering, INR prices, vegetarian indicators and availability
    labels. Do not use a test photo against the live ImageKit account.

Website settings are managed separately at `/admin/settings`; see
[Website settings management](admin-settings.md). Room management and room
image upload behavior are unchanged.

## Files in this phase

Created:

- `server/src/routes/adminMenu.js`
- `server/test/adminMenu.test.js`
- `client/src/hooks/useAdminMenuData.js`
- `client/src/components/admin/RestaurantNav.jsx`
- `client/src/components/admin/MenuRecordCard.jsx`
- `client/src/components/admin/MenuRecordForm.jsx`
- `client/src/pages/AdminRestaurantPage.jsx`
- `client/src/pages/AdminMenuEditorPage.jsx`
- `client/src/styles/admin-menu.css`
- `tests/e2e/adminRestaurant.spec.js`
- `server/src/routes/adminMenuImages.js`
- `server/src/services/menuImageCleanup.js`
- `server/src/services/imageUploads.js`
- `server/test/adminMenuImages.test.js`
- `client/src/components/admin/AdminMenuImage.jsx`
- `tests/e2e/adminMenuImages.spec.js`
- `docs/admin-restaurant.md`

Modified:

- `server/src/app.js`
- `server/src/models/MenuCategory.js`
- `server/src/models/MenuItem.js`
- `server/src/routes/publicContent.js`
- `client/src/app/App.jsx`
- `client/src/components/admin/AdminLayout.jsx`
- `client/src/pages/AdminDashboardPage.jsx`
- `tests/fixtures/roomServer.js`
- `AGENTS.md`
- `README.md`
