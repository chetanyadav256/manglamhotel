# Admin room management

Run `npm run dev` from the repository root. Open
`http://127.0.0.1:5173/admin/login`, sign in with the existing account, and select
**Rooms Management**. The page is `/admin/rooms`; forms use `/admin/rooms/new`
and `/admin/rooms/:id/edit` within the existing protected admin layout.

## Behavior

- Rooms start as unpublished drafts. No rooms or sample content are seeded.
- Add/edit name, description, optional INR price, amenities and display order.
- Publication is a separate confirmation action; saving details does not toggle it.
- Published rooms appear in public lists/details. Unpublishing hides them from
  subsequent public API responses immediately. Already-open public pages refresh
  content on reload/navigation; no realtime availability or push updates exist.
- Archive sets `isArchived: true` and `isPublished: false` together. Records and
  image metadata remain in MongoDB. Restore sets both flags false, requiring a
  separate publication action. Archived records cannot be edited or published.
- Search is literal, case-insensitive room-name matching, with active/archive/all
  filters and pagination. Default UI page size is 12. Creation/update timestamps
  are shown in the hotel's Asia/Kolkata timezone.
- Room photos are managed in the dedicated editor section, not through room
  create/edit request bodies.
- Forms retain values after failed saves, disable duplicate submissions, warn
  before navigating away with unsaved changes, and support Cancel. Draft values
  are not persisted to browser storage; an expired session requires signing in
  again and may discard unsaved local edits.

## Protected API contract

All endpoints require a valid active administrator session. Mutations require
the existing allowed Origin, same-site request policy, and a CSRF token
matching both the cookie and the authenticated session's stored token hash.
Room field mutations require JSON; photo uploads use multipart form data.
Reads and public room responses use `Cache-Control: no-store`.

| Endpoint | Behavior |
| --- | --- |
| `GET /api/admin/rooms` | Paginated list: `page`, `limit` <=100, `search` <=120 chars, `status=active\|archived\|all` (default active) |
| `GET /api/admin/rooms/:id` | One room including archived records |
| `POST /api/admin/rooms` | Create draft; returns 201 |
| `PATCH /api/admin/rooms/:id` | Update only allowed fields on an active room |
| `DELETE /api/admin/rooms/:id` | Soft-archive and unpublish; JSON body `{}` |
| `POST /api/admin/rooms/:id/restore` | Restore an archived room as a draft; JSON body `{}` |

List responses are `{ data, pagination }`; single-record responses are `{ data }`.
Admin prices are numeric INR amounts or null. Public serialization remains the
existing `{ amount, currency: 'INR' }` contract. Errors return safe messages:
400 invalid input/ID, 401 no active session, 403 origin/CSRF, 404 missing record,
409 archived/stale action conflict, 415 content type, 503 database unavailable.
Unexpected failures return 500 without internal details.
Database network/selection failures return 503. Server-side errors are logged
with a request ID (also returned in `X-Request-ID`), operation, error name/code,
and a sanitized stack; public API messages remain generic. ImageKit errors are
logged separately from MongoDB failures. The development server watches only
`server/src`, so dependency updates do not restart Express.

Allowed POST/PATCH fields:

| Field | Validation |
| --- | --- |
| `name` | Required on create, trimmed 1–120 characters |
| `description` | Optional string, trimmed, maximum 3000 characters |
| `pricePerNight` | Optional finite number, 0–10000000 INR, at most two decimal places; `null` or empty string clears it |
| `amenities` | Array, at most 50 strings of 1–120 trimmed characters; case-insensitive duplicates removed |
| `displayOrder` | Integer 0–100000 |
| `isPublished` | Boolean; create rejects true, PATCH changes visibility only on active rooms |

Other fields are rejected, including images, `_id`, `isArchived`, timestamps and
MongoDB operators. No whole-body assignment reaches Mongoose. Updates use
`runValidators: true`; conditional atomic updates protect the archive/publication
invariant against stale publish/edit requests. There is no permanent-delete path.

The Room model gains `isArchived` (default false) and an archive/order index.
The project is single-hotel and uses its existing `manglam_hotel` database.
No backfill is necessary: absent archive flags are treated as active via `$ne`.
Existing image subdocuments are retained; legacy images without ImageKit file
metadata are not deleted or destructively migrated.

## Automated checks

```powershell
npm run check
npm run test:e2e
```

`tests/fixtures/roomServer.js` starts Express on an ephemeral local port with
in-memory model adapters and real Mongoose document validation. Actual session,
CSRF, origin, validation, serialization and room route logic runs. It does not
connect to MongoDB or load `.env`; browser room tests redirect **all** API
requests to this fixture. No real accounts or rooms are created or changed.
This validates HTTP/UI behavior but does not substitute for deployment-specific
Atlas connectivity/index/performance verification.

Browser tests cover creation, editing, publication, public listing, unpublishing,
archive confirmation/cancellation, restore, field validation, unsaved changes,
failed-save recovery, unauthorized access, search, invalid/deleted IDs and
layouts at 360, 393, 768, 1024 and 1440px. Screenshots are in `test-results/`.

## Manual testing

For tests without genuine content changes, use the automated isolated fixtures.
When checking the real application, use only owner-approved room content:

1. Start with `npm run dev` and sign in at `/admin/login`.
2. Select **Rooms Management**, then **Add room**. Submit an empty form to verify
   name validation. Enter the approved name/description and optional INR price.
   Use **Add amenity** for each confirmed amenity; confirm duplicates are rejected.
3. Select **Create draft**. Verify the draft badge and timestamps. Reload `/rooms`
   in a separate tab and confirm the draft is not listed.
4. Select **Edit room**. Change details/display order, clear the price if desired,
   then **Save changes**. Verify image metadata is still displayed if present.
   Make another edit, select **Cancel**, and cancel the discard dialog to keep it.
5. From the list, select **Publish room** and confirm. Reload `/rooms`; verify
   details, optional INR price, amenities and image fallback. **Enquire Now** must
   navigate to `/contact`, preserving phone/Instagram/location ordering.
6. Select **Unpublish room**, confirm, and reload `/rooms` to verify it is hidden.
7. Select **Archive room**, cancel once, then confirm. Switch **Show rooms** to
   **Archived rooms** and **Apply filters**. Verify its archived status and that
   no publish/edit action is offered.
8. Select **Restore room**, confirm, switch back to **Active rooms** and apply.
   Verify it is an unpublished draft, still hidden publicly. Publish only if the
   content is genuinely ready to be public.
9. Search by room name, try a nonmatching name, and exercise pagination when
   enough approved records exist. Check mobile menu/forms at the target widths.
10. Sign out and open `/admin/rooms` directly; verify redirect to `/admin/login`.
11. For photo testing, use only approved real hotel photos. In a room editor,
    select up to five JPEG/PNG/WebP images (5 MB each), add descriptive alt
    text, upload, choose a main photo, and delete one photo after confirming.
    Publish only when the room content is approved, then verify the public
    gallery and contact enquiry link.

If MongoDB becomes unavailable after ImageKit has accepted an upload, the API
returns 503 and retains assets whose metadata state is uncertain rather than
deleting them. The capacity reservation expires after 15 minutes. Use the
response's `X-Request-ID` to locate the sanitized server log entry, then inspect
the affected room and ImageKit folder before retrying or removing any asset.
The application cannot prove whether remote uploads from an earlier interrupted
attempt are orphaned; inspect them manually and do not delete assets without
confirming they are absent from room metadata.

## Files in this phase

Created:

- `server/src/routes/adminRooms.js`
- `client/src/components/admin/AdminLayout.jsx`
- `client/src/components/admin/AdminRoomForm.jsx`
- `client/src/components/admin/AdminRoomListItem.jsx`
- `client/src/components/admin/AmenitiesEditor.jsx`
- `client/src/components/admin/ConfirmDialog.jsx`
- `client/src/components/admin/ManagementState.jsx`
- `client/src/components/admin/RoomStatus.jsx`
- `client/src/pages/AdminRoomsPage.jsx`
- `client/src/pages/AdminRoomEditorPage.jsx`
- `client/src/styles/admin-rooms.css`
- `server/test/adminRooms.test.js`
- `server/src/routes/adminRoomImages.js`
- `server/src/services/imageKitStorage.js`
- `server/test/adminRoomImages.test.js`
- `client/src/components/admin/AdminRoomImages.jsx`
- `tests/e2e/adminRoomImages.spec.js`
- `tests/fixtures/roomServer.js`
- `tests/e2e/adminRooms.spec.js`
- `docs/admin-rooms.md`

Modified:

- `server/src/app.js`
- `server/src/security/adminAuth.js`
- `server/src/models/Room.js`
- `server/src/routes/publicContent.js`
- `server/src/middleware/errors.js`
- `client/src/app/App.jsx`
- `client/src/app/AdminAuthContext.jsx`
- `client/src/pages/AdminDashboardPage.jsx`
- `server/test/app.test.js`
- `tests/e2e/admin.spec.js`
- `AGENTS.md`
- `README.md`

Restaurant image uploads, restaurant administration and settings administration
remain unimplemented by design. Public page designs and contact content are
unchanged. ImageKit automated tests use an isolated mock; they do not modify
production data, contact ImageKit, or read/modify `server/.env`.

## Room photo management

`GET /api/admin/rooms/:id/images` returns sanitized room image metadata.
`POST /api/admin/rooms/:id/images` accepts multipart `images`, a required UUID
`uploadId` (reused for retries), and optional matching `altTexts` fields.
`DELETE /api/admin/rooms/:id/images/:imageId`
removes one room-owned ImageKit photo, and
`PATCH /api/admin/rooms/:id/images/:imageId/main` makes the selected photo
first. The upload route validates JPEG/PNG/WebP file structure and MIME
consistency, enforces five photos per room and 5 MB per image, stores temporary
files on disk only, and caps concurrent uploads at two per process. MongoDB
capacity reservations prevent concurrent overfill across instances. Archived
rooms reject all image mutations.

New assets are stored under `/manglam-hotel/rooms/<room-id>/` with unique
filenames. MongoDB stores stable image IDs, file IDs/paths, CDN URLs, alt text
and display order. The first image is the main image. If deletion fails after
room metadata is removed, a cleanup record remains on the room and a background
worker retries it. Public room responses expose the ordered URLs and use
ImageKit width/quality/format transformations for standard ImageKit CDN URLs.
The UI reuses a selection ID on retry; the last 100 completed IDs per room
prevent repeat requests from adding duplicate image records.
Configure the server-only `IMAGEKIT_PRIVATE_KEY` in `server/.env`; no additional
ImageKit endpoint value is required.

Automated server and browser photo tests use the isolated in-memory fixture and
mock storage adapter. A real ImageKit upload was not performed as part of
automated verification.
