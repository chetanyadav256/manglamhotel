# Manglam Hotel & Restaurant

JavaScript MERN monorepo, independent from Manglam Furniture.
The public homepage, responsive navigation, footer, Contact, Rooms and Restaurant
pages are implemented. Rooms and menu content come from published database
records and remain empty until verified hotel content is added. `/admin` is
protected by database-backed sessions. `/admin/rooms` supports room creation,
editing, publication, soft archive and restoration. `/admin/restaurant` supports
category and dish management, prices, availability, automatic publication on
creation and confirmed permanent deletion. Existing archives remain accessible.
Saved dishes support protected ImageKit photo management. See
[Restaurant deletion and recovery](docs/restaurant-deletion.md) for transactional
dependency checks, durable cleanup jobs and deployment considerations. Admins can update
public hotel details through protected website settings management.

## Requirements and quick start

Use Node.js 24 LTS and npm 11+. From the repository root:

```powershell
npm ci
if (-not (Test-Path client/.env)) { Copy-Item client/.env.example client/.env }
if (-not (Test-Path server/.env)) { Copy-Item server/.env.example server/.env }
npm run dev
```

Copy the examples only once; do not overwrite an existing configured `.env`.
Both apps also start with safe local defaults if the `.env` files are absent.

- Frontend: http://127.0.0.1:5173
- API: http://127.0.0.1:5000/api/health
- Proxied API: http://127.0.0.1:5173/api/health

Stop development with Ctrl+C. `concurrently` stops both processes when either
exits. Ports are fixed so conflicts surface instead of silently changing URLs.
If changing the API `PORT`, update the client's `API_PROXY_TARGET` to match.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run both development servers |
| `npm run dev:client` | Run Vite only |
| `npm run dev:server` | Run Express with Node watch mode |
| `npm run lint` | ESLint across both workspaces |
| `npm test` | Node's native API/config tests |
| `npm run build` | Build the frontend into `client/dist` |
| `npm run check` | Lint, tests, then frontend production build |
| `npm run test:e2e` | Chromium responsive, navigation, metadata and admin UI checks |
| `npm run preview` | Preview the built frontend on port 4173 |
| `npm start` | Start Express without watch mode |
| `npm run seed:site-settings --workspace @manglam/server` | Insert initial public contact settings only when absent |
| `npm run create-admin --workspace @manglam/server` | Interactively create an administrator account |

`npm run preview` is for local build inspection, not production hosting.
Vite preview inherits the development API proxy; start the API separately if
checking `/api` through preview.
The server uses Node's `--watch-path=src` mode so edits in application source
restart Express without watching dependency changes in `node_modules`, temporary
uploads, or generated output.

For first-time browser test setup, run `npx playwright install chromium`.
The E2E command starts Vite automatically when it is not already running.
It covers 360, 393, 768, 1024 and 1440px widths, keyboard/mobile navigation,
same-document routing, back/forward scroll restoration, contact link targets,
new-tab Maps behavior, admin protected-route/login/refresh/logout flows,
responsive admin layout and reduced motion. Full-page homepage/Contact screenshots
are saved under ignored `test-results/` folders.

## Structure

```text
client/
  .env.example
  index.html
  vite.config.js
  src/
    app/                 Route definitions and admin auth context
    components/admin/    Protected layout, reusable room form/cards and dialogs
    components/layout/   Shared header, navigation and footer
    components/seo/      Route metadata and hotel/restaurant structured data
    components/home/     Hero, selection cards, introduction and location
    components/ui/       Reusable page intro and action link
    config/              Owner-provided public contact details
    data/                Frontend Room and menu contracts
    hooks/               Abortable API request state
    pages/               Home, rooms, restaurant, contact, admin login/dashboard and 404
    services/            API request boundary
    styles/              Tailwind entry point, design tokens and admin styles
server/
  .env.example
  src/
    app.js               Express composition
    index.js             Startup and graceful shutdown
    config/              Environment validation and MongoDB connection
    models/              Content, SiteSettings, Admin, sessions and rate limits
    middleware/          JSON error handling
    routes/              Health, SEO, public reads and protected admin APIs
    services/             ImageKit storage, upload validation and cleanup
    security/             Admin session, CSRF, origin and rate-limit controls
    scripts/              Site settings seed and manual admin creation
  test/                  Model, API, admin-auth and environment checks
AGENTS.md                Requirements and future engineering conventions
eslint.config.js         Shared flat ESLint configuration
playwright.config.js     Local browser test setup
tests/e2e/               Responsive and navigation browser tests
shared/                  Client/server route metadata and schema data
docs/render-deployment.md Render production preparation and verification guide
package.json             Workspace commands
package-lock.json        Reproducible dependency tree
```

## Current behavior

Routes include `/`, `/rooms`, `/restaurant`, `/contact`, `/admin/login`,
`/admin`, `/admin/rooms`, `/admin/rooms/new`, `/admin/rooms/:id/edit`,
`/admin/restaurant`, restaurant category/item routes, `/admin/settings`, and a
fallback not-found page. The homepage presents Rooms & Availability and Restaurant.
Room enquiries navigate to Contact. Contact shows the supplied phone numbers,
Instagram, then address/Google Maps in that order.

Internal navigation uses React Router's data router with built-in scroll
restoration and keyboard focus management. The compact mobile menu supports
Escape, outside-click dismissal and closes when navigating. Maps stays visible
on mobile and opens the confirmed listing in a new tab. All external social/map
links include safe new-tab attributes. Phone links open the device's dialer.
The hero uses an original decorative SVG illustration, not a property photograph.

Room records and menu content have not yet been supplied. No property photographs,
room types, amenities, dishes or prices have been invented. Admin login and a
protected, noindex dashboard are present. Room and restaurant management,
including optional restaurant photos, and protected website settings management
are implemented.

Public database-backed endpoints:

- `GET /api/rooms` and `GET /api/rooms/:id` expose published, non-archived rooms only.
- `GET /api/menu/categories` exposes published, nonarchived categories.
- `GET /api/menu/items?category=<category-id>` exposes published items whose
  categories are published and nonarchived; archived items are hidden and
  availability is returned separately.
- `GET /api/site-settings` returns approved public hotel settings only.
- `GET /api/admin/site-settings` and `PATCH /api/admin/site-settings` provide
  protected settings retrieval and revision-aware updates.

List routes accept `page` and `limit` (maximum 100) and return `{ data,
pagination }`. Collections remain empty until real published records are
entered by an authorized administrator. There are no public
mutation routes. A connected database with no published content returns empty
lists; database-backed endpoints return 503 when MongoDB is unavailable.

`GET /api/health` returns:

```json
{ "status": "ok", "service": "manglam-hotel-api" }
```

This checks API liveness only, not database readiness or room availability.
Unknown API endpoints return JSON 404 errors; production serves the React SPA
for frontend navigation paths and returns route-specific initial HTML metadata.
Helmet provides baseline API
security headers, JSON bodies are limited to 32 KB, public list pagination is
capped, and errors omit stacks and database credentials.

## Environment

`server/.env` is server-only and must set `MONGODB_URI` to the MongoDB Atlas
connection URI. The application explicitly selects the `manglam_hotel`
database. The URI is never returned by the API or written to application logs.
Production requires a valid URI; development may start without one, in which
case database-backed routes return 503. `client/.env` configures Vite. Any
`VITE_*` variable is embedded into the public bundle: never put a server secret
there. Environment files and generated artifacts are ignored by Git.
Production additionally requires `IMAGEKIT_PRIVATE_KEY`,
`ADMIN_ALLOWED_ORIGINS`, `PUBLIC_SITE_URL`, and the correct
`TRUST_PROXY_HOPS`. Express binds to `0.0.0.0` in production. See the
[Render deployment guide](docs/render-deployment.md) for exact settings.

The server creates declared MongoDB indexes during startup and closes the
connection during graceful shutdown. MongoDB TLS verification remains enabled.
After a successful connection, the MongoDB driver monitors topology and handles
transient reconnection; database operations have a five-second server-selection
timeout. The application does not run an unbounded retry loop. If the initial
startup connection fails, correct the network/configuration and restart the
server. Database-backed APIs return 503 while the database is unavailable.
The `seed:site-settings` command uses `$setOnInsert`; rerunning it leaves
customized settings unchanged and never inserts room or menu records.
Settings edits update the singleton only, validate a strict field allowlist and
reject stale revisions with HTTP 409. The public response contract does not
expose the internal revision. ImageKit room and restaurant photo uploads use a
server-only private key.

## Admin authentication foundation

No administrator account is created automatically. After configuring a valid
server-side `MONGODB_URI`, create the first account manually from an interactive
terminal:

```powershell
npm run create-admin --workspace @manglam/server
```

The script normalizes and validates the email, prompts for a 6-to-20-character
password containing at least one lowercase letter, one uppercase letter, and
one number (symbols are optional), without echoing it. It requires confirmation,
hashes the password using Argon2id and rejects duplicate addresses. It does not
print the password/hash.
The CLI command must be run by an authorized operator; no public registration
route exists.

`POST /api/admin/login`, `GET /api/admin/me`, and `POST /api/admin/logout`
provide login, safe profile retrieval and session revocation. `GET
/api/admin/csrf` provides the CSRF token required by login/logout. Sessions are
opaque random values in HttpOnly, SameSite cookies; only SHA-256 token hashes
and CSRF-token hashes are persisted. Idle expiration is 24 hours, absolute
expiration is seven days, and MongoDB TTL indexes clean up old sessions and
rate-limit buckets. Login attempts are limited per source IP in a shared
MongoDB-backed 15-minute window, which works across application instances.
Express does not trust forwarded IP headers by default. For deployments behind
trusted reverse proxies, configure `TRUST_PROXY_HOPS` to the exact number of
controlled proxy hops; do not enable proxy trust when clients can bypass those
proxies.

State-changing auth requests require an exact configured `Origin`, a same-site
request, and CSRF validation. JSON is required for auth and room management;
the protected room-photo upload route accepts only multipart form data. In production set
`ADMIN_ALLOWED_ORIGINS` to the exact HTTPS origin(s), comma-separated; the
server refuses production startup configuration without it. Development
defaults to the local Vite origins. The auth cookies use the `__Host-` prefix
and `Secure` in production; configure production TLS and same-origin `/api`
routing. Room management reuses these session/origin/CSRF controls. Creation
always saves a draft; all other management areas remain disabled.

## Admin room management

Open `/admin/rooms` after signing in. Search by name, paginate, filter active or
archived rooms, add/edit room details, explicitly publish/unpublish, archive,
and restore drafts. Prices are optional INR amounts and can be cleared. The
room editor provides protected photo upload, preview, ordering, main-photo
selection and deletion; arbitrary image URL editing is not available.

See [Admin room management](docs/admin-rooms.md) for endpoints, validation rules,
changed files, test isolation, and exact manual testing steps. `npm run check`
runs lint/API tests/build; `npm run test:e2e` runs browser checks including the
admin-to-public room and settings workflows against isolated fixture APIs.

## Website settings management

Open `/admin/settings` after signing in to update the public hotel name, phone
numbers, Instagram profile, address and Google Maps listing. Settings saves use
the existing session/CSRF protections and revision checks; public settings
remain read-only. See [Website settings management](docs/admin-settings.md) for
validation rules, endpoints and manual verification.

### ImageKit photo storage

Room photographs and optional restaurant menu-item photographs are uploaded
server-side with the official `@imagekit/nodejs`
SDK. Configure `IMAGEKIT_PRIVATE_KEY` only in the private `server/.env`; the
safe example file leaves it blank. No ImageKit endpoint or public-key setting is
needed: the upload API response supplies the asset URL. The browser never
receives the private key. Restaurant menu items support one photo each.

The protected APIs are `GET /api/admin/rooms/:id/images`,
`POST /api/admin/rooms/:id/images` (multipart field `images`, selection UUID
field `uploadId`, optional matching `altTexts`), and
`DELETE /api/admin/rooms/:id/images/:imageId` and
`PATCH /api/admin/rooms/:id/images/:imageId/main`. Uploads accept JPEG, PNG and
WebP only, validate file structure and signatures, limit each file to 5 MB and
each room to five photos, and cap concurrent upload requests at two per
process. Capacity reservations are atomic in MongoDB and expire after
15 minutes if a process stops mid-upload. Temporary uploads are disk-backed
and removed after each request. ImageKit assets are stored under
`/manglam-hotel/rooms/<room-id>/` with unique filenames.
Each selection has a stable request ID; the last 100 completed IDs per room are
remembered so retries return saved photos instead of duplicating metadata.
The SDK uses its documented stream upload and abort-signal options with retries
disabled and a 30-second timeout. A request interruption aborts the remote
request when possible, releases the reservation, and removes temporary files.
If MongoDB becomes unavailable after ImageKit accepts a photo, the server does
not delete an asset whose metadata persistence is uncertain; it returns 503,
retains a request-correlated diagnostic, and leaves the reservation to expire
after 15 minutes. That uncertain remote asset may require manual ImageKit
inspection. Do not delete it until its association with room metadata has been
checked.

Restaurant photo endpoints are protected by the same admin session, CSRF and
origin checks:

- `GET /api/admin/menu/items/:id/image` — read the current image and version.
- `POST /api/admin/menu/items/:id/image` — upload the first photo.
- `PUT /api/admin/menu/items/:id/image` — replace an existing photo.
- `PATCH /api/admin/menu/items/:id/image` — update alternative text.
- `DELETE /api/admin/menu/items/:id/image` — remove the photo.

Uploads accept one JPEG, PNG or WebP image up to 5 MB and validate both its
signature and decoded image data (maximum 40 megapixels). Each menu item stores
at most one managed image under `/manglam-hotel/restaurant/<item-id>/`.
Version-checked updates prevent stale admin edits from replacing newer photos.
A replacement commits new metadata and queues the previous managed asset in one
MongoDB update; old media is deleted only after that succeeds. Failed deletion
records are retried by the existing cleanup worker. Legacy/unmanaged photo
assets are never deleted by this flow.

After uncertain database acknowledgements, the server keeps assets that may be
referenced and returns a safe error rather than risking deletion of a current
photo. Inspect the dish and its ImageKit item folder before retrying or removing
any asset. Tests use isolated fixtures and mocked storage; no real ImageKit
upload or production Atlas mutation is part of automated validation.

MongoDB stores a stable image ID, ImageKit file ID, URL, path, alternative
text, and display order. The first image in order is the main room photo.
Deletion removes room metadata atomically and records external cleanup work in
the room document; the background worker retries failed ImageKit deletions.
Legacy image metadata remains visible and is not destructively migrated.

To verify a first real upload after reviewing the implementation and configuring
the private key: start the app with `npm run dev`, sign in to `/admin`, create or
open a room in `/admin/rooms`, select verified JPEG/PNG/WebP photographs in the
Room photos section, provide alternative text, and upload. Confirm the photos
appear in the room editor, set the intended main photo, publish the room only
when its content is approved, then verify it at `/rooms`. Automated tests use
an isolated ImageKit mock and never send files to the configured ImageKit
account or modify Atlas.

For restaurant photos, sign in, open a saved dish in
`/admin/restaurant/items/:id/edit`, upload an approved image, and verify the
admin preview and public `/restaurant` card. Test replacement and removal only
with an approved real photo. Automated tests use mocks and do not verify a real
ImageKit account.

The reservation aggregation update explicitly uses `{ updatePipeline: true }`,
as required by Mongoose 9 (verified with installed version 9.11.2). Pipeline
values are not schema-cast: UUIDs are validated, counts come from the bounded
file list, expiry is a JavaScript Date, and order is calculated atomically.
The reservation write is inside the cleanup scope so an acknowledgement failure
also attempts to release only that request's reservation. Existing room metadata
and other reservations are not removed.

Regression tests execute the installed Mongoose query pipeline against an
isolated in-memory collection adapter, including filter casting and timestamps.
They reproduce the original rejection without the option and cover concurrent
reservations, typed reservation values, retries and cleanup failures. This does
not run the aggregation on a live MongoDB server or contact ImageKit.

For the specific missing-`updatePipeline` error, Mongoose rejects the query
before writing a reservation or uploading an ImageKit asset; that failed attempt
needs no remote cleanup. Restart the API with the fix, reload the existing room
editor, check that the photo is absent and fewer than five photos are present,
then select one approved JPEG/PNG/WebP file (up to 5 MB), enter alternative text,
and click Upload once. Reload after success and confirm exactly one new photo.
For a different failure reporting uncertain persistence, inspect the room first
and follow the recovery guidance above; do not delete existing remote assets.

## Room content architecture

Restaurant administration, validation rules, protected endpoints, schema/index
changes, isolated test coverage and manual steps are documented in
[docs/admin-restaurant.md](docs/admin-restaurant.md).

`client/src/data/rooms.js` documents the frontend Room contract: stable `id`,
`name`, optional plain-text `description`, `images` with `src`/descriptive
`alt`, `amenities`, and optional `pricePerNight` with numeric `amount` in major
units and an ISO currency code. Rooms fetches published API records and maps
them to the existing `RoomCard`/`RoomGallery` components. Loading, error, and
legitimate empty states are distinct.
The hero and lower contact banner also link to `/contact`.

`RoomCard` renders only supplied room content. Missing prices invite a direct
enquiry. `RoomGallery` handles multiple photos, keyboard-operable previous/next
and thumbnail buttons, explicit missing/broken-image fallbacks, and no autoplay.
All room enquiries use React Router links; no booking form is present.

`client/src/data/menu.js` documents normalized `MenuCategory` and `MenuItem`
contracts and exports empty arrays. Restaurant fetches public menu records,
filters by category, and supports optional descriptions, INR prices, a restaurant-level 100% Pure Vegetarian label, availability, and missing/broken
images. Menu items support multiple categories and searchable tags. Public
search matches dish names/tags locally without per-keystroke requests. See
[Menu schema evolution](docs/menu-schema-evolution.md) for legacy compatibility,
optional manual migration, indexes and pre-deployment checks.
`tests/e2e/rooms.spec.js` and `tests/e2e/restaurant.spec.js` use isolated API
fixtures which are never imported into production. Contact fetches settings
from the API and falls back to the confirmed centralized client configuration
when unavailable.

## Future deployment

The production server serves the built `client/dist` assets and the Express API
from the same origin, with an SPA fallback for client routes. Configure
`NODE_ENV=production`, the exact HTTPS origins, `PUBLIC_SITE_URL`,
`TRUST_PROXY_HOPS`, and the server-only MongoDB Atlas and ImageKit credentials.
No deployment has been performed. See
[Render production preparation](docs/render-deployment.md) for the verified
single-service configuration and Free-tier limitations.

Semantic markup and route-specific metadata provide an SEO foundation.
Configure `PUBLIC_SITE_URL` in production to enable canonical URLs, sitemap,
and Open Graph URLs. Admin routes are noindex. The public pages remain a
client-rendered SPA rather than full SSR/prerendering, and no social image is
configured until an approved asset/domain is provided. See
[Render production preparation](docs/render-deployment.md) for deployment
configuration and Free-tier SEO limitations.

Setup follows the official [Vite](https://vite.dev/guide/),
[Tailwind Vite](https://tailwindcss.com/docs/installation/using-vite),
and [React Router](https://reactrouter.com/start/declarative/installation)
guides.
