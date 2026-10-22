# Restaurant publication and permanent deletion

This phase changes restaurant administration only. Room archives, uploads and
public layouts remain unchanged. No production database/media operations,
credentials changes, migrations, commits, pushes or deployment were performed.

## Publication and admin behavior

Category and dish POST endpoints explicitly write `isPublished: true`; this is
enforced by the server. Creation accepts an omitted/true publication flag and
rejects false. The UI uses **Add Category** and **Add Menu Item**. New dishes
appear in their published categories on the next public fetch; an already-open
public page still needs navigation/reload. Photos remain optional and can be
uploaded from Edit item after saving.

Existing unpublished/archived records are not modified automatically. Publish,
Unpublish, availability and explicit restoration of old archives remain.
Restoration still leaves an unpublished record. Record status → Previously
archived finds old archives. There is no new Archive action or soft-delete API
in restaurant management. Schema publication defaults remain false for legacy
compatibility; the create endpoints explicitly opt new records into publication.

## Permanent deletion API

Both DELETE `/api/admin/menu/items/:id` and DELETE
`/api/admin/menu/categories/:id` require JSON:

```json
{ "confirmPermanentDelete": true }
```

All existing active-session, allowed-origin, same-site and CSRF protections
remain. Unknown fields/queries, invalid IDs and missing/false confirmation are
rejected. A stale client's former DELETE `{}` archive request cannot permanently
delete anything. The UI dialog states that deletion is permanent and cannot be
undone, focuses Cancel, supports Escape, and disables duplicate submissions.

- 200: deletion completed, or the ID is already absent (safe retry).
- 202: dish is deleted, but durable photo cleanup is pending. The UI displays a
  warning rather than claiming photo removal succeeded. Managed assets retry
  automatically; unverified legacy assets require operator review.
- 409: category is still referenced. The message tells the admin to reassign or
  delete dishes first, including archived dishes.
- 503: database/cleanup persistence or commit acknowledgement failed. Reload
  before retrying. If commit acknowledgement was uncertain, the record may
  already be gone; retrying the same DELETE is safe.

No client may supply ImageKit IDs, URLs, cleanup metadata or internal revisions.

## Category dependencies and concurrent edits

Dish creation, category reassignment, publication and restoration run in a
MongoDB transaction. They validate each category and increment its internal
`referenceRevision` in deterministic ID order, without modifying its public
`updatedAt`. Category deletion writes the same revision inside a transaction
before counting references and deleting. This shared write prevents concurrent
assignment/deletion from both committing based on stale snapshots.

The dependency query counts **both** `category` and `categories[]`, even when
the legacy field is stale, and includes published, unpublished and archived
dishes. It never removes a category from dishes or deletes associated dishes.
An admin must explicitly reassign/delete them. Other memberships stay intact.

Transactions use snapshot reads, majority writes and the primary. Every query
in the unit of work receives the session; operations inside the transaction run
sequentially, following the [Mongoose transaction guidance](https://mongoosejs.com/docs/transactions.html).
There is no unsafe fallback to nontransactional writes on standalone MongoDB.

## ImageKit cleanup safety

`MenuImageCleanupJob` is an internal durable outbox in the same hotel database.
Each job has an idempotent hash ID, owning item ID, original asset metadata,
review flag and retry timestamps. No TTL removes pending jobs.

Dish deletion copies **all** embedded `pendingImageCleanup` entries and the
current photo into jobs, then deletes the dish in the **same transaction**.
Failure to persist a job aborts the deletion; no remote photo is touched before
commit. Concurrent photo edits conflict with deletion's write, causing a fresh
transaction read so the latest photo metadata is retained.

The existing periodic ImageKit worker processes the outbox as well as existing
embedded queues. It checks the restaurant/item folder, refuses unverified paths,
and checks that no room or menu item currently references the file ID. Successful
deletion (or ImageKit 404) removes the job. Remote/database failures retain the
job; oldest-attempt ordering prevents repeatedly failing jobs from monopolizing
the batch. Duplicate worker attempts are safe, although the SDK may see repeated
deletes and return 404.

An upload that finishes after its dish is deleted cannot commit metadata to a
missing record. Its compensation checks the embedded-queue write's matched
count and persists a standalone job when the item is gone. If the database is
unavailable and compensation cannot be saved, the response is a recovery error;
the new asset is retained, never guessed safe to delete. Existing uncertain
upload/commit recovery remains conservative.

Unmanaged legacy images and unverified old queue entries are copied into jobs
with `requiresReview: true`. They are never automatically deleted. Operators
must verify ownership/references before any manual asset action. They can inspect
`menuimagecleanupjobs` in an authorized staging/Atlas administration tool; do not
clear jobs simply to silence warnings. Also inspect the item-specific ImageKit
folder after an upload reports unsaved/uncertain cleanup, as an unavailable
database cannot durably record a newly returned remote asset.

## Category selector CSS

The old `.admin-menu-checkbox input` rule tied in specificity with
`.admin-room-form input`. A later-loaded room stylesheet could win with
`width: 100%`, `min-height: 48px` and input padding. Generic label margins and
wrapping amplified the spacing problem. This depended on route/chunk load order.

The category selector now has its own option class and a scoped grid with a
fixed 20px checkbox column and a flexible text column. More-specific selectors
reset checkbox dimensions, padding and margins irrespective of chunk order.
Full rows are clickable, selected rows have a green tint, status text is linked
with `aria-describedby`, and archived choices are disabled except while selected
for removal. Normal word wrapping, selected-category text, focus outlines and
responsive grid sizing preserve keyboard/mobile usability. Room form styles
and unrelated checkbox rules are not changed.

## Verification and deployment considerations

Run `npm run check`, `npm run test:e2e`, and `git diff --check`. Tests use real
Express/auth/Mongoose validation plus an isolated snapshot/write-conflict fixture
and mocked ImageKit. They do not connect to production or prove real Atlas
transaction scheduling, permissions or index creation.

Before a separately approved deployment:

1. Use a staging replica-set/Atlas copy and disposable approved test media.
   Confirm transactions, majority writes and creation of the new cleanup-job
   collection/indexes work with the deployment database user.
2. Add a category and multi-category dish; verify immediate API publication,
   public search/tags/prices, availability and saved-dish photo uploads.
3. Try deleting a referenced category: expect 409 and no data loss. Reassign or
   delete its dishes, then confirm category deletion succeeds.
4. Cancel a dish delete, then confirm it. Verify all public memberships disappear
   and its managed asset is deleted or remains represented by a durable job.
   Exercise remote failure/commit recovery on staging, not live hotel content.
5. Find a previously archived record and explicitly restore or delete it. Verify
   no other legacy record was silently restored or published.
6. Navigate between rooms and restaurant administration before inspecting the
   checkbox layout at 360, 393, 768, 1024 and 1440px. Check keyboard selection,
   long category names, archived options and permanent-delete dialogs.
7. Drain old admin writes before enabling this backend; do not mix old backend
   instances that assign categories without the new transaction protocol.
   Refresh admin tabs. An old frontend's archive DELETE is deliberately rejected.

Permanent deletion is not undone by rolling application code back. Retain a
verified database backup before enabling it. Rollback must also retain/process
the new cleanup collection: an older worker does not know about these jobs.
Do not drop the outbox or bulk-publish records as part of deployment.
