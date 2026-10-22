# Manglam Hotel & Restaurant

This is an independent project in this repository. Do not read, modify, import,
or couple it to the owner's Manglam Furniture project.

## Scope and product rules

- Stack: JavaScript, React with Vite, Tailwind CSS, React Router, Node.js,
  Express, npm workspaces, and eventually MongoDB Atlas through Mongoose.
- ImageKit is configured for verified room photo uploads and one optional food
  photo per restaurant menu item.
- Current scope includes the public homepage, navbar, footer, Contact, Rooms and
  Restaurant pages, Mongoose models, published-content read-only APIs, and
  protected admin authentication/dashboard, room management and protected room
  photo management, plus protected restaurant category/item and photo management.
  Protected website settings management edits the single seeded public hotel
  settings document while preserving the read-only public settings API.
- Homepage must prominently offer **Rooms & Availability** and **Restaurant**.
- Rooms will show owner-approved images, descriptions, prices when provided,
  and amenities. **Enquire Now** must navigate to `/contact`.
- Never claim real-time availability. Hotel staff confirm availability.
- No room booking, online ordering, table booking, or payment functionality.
- Never invent rooms, amenities, dishes, prices, testimonials, ratings,
  hours, or actual hotel images. Use clear text placeholders until verified
  content is supplied. Do not use stock photos as actual property photos.
- Admin scope includes rooms/photos, descriptions, prices, restaurant
  categories/menu items/photos and public hotel details. Settings updates use
  the existing session, exact origin and CSRF protections, strict field
  validation, and revision-based conflict detection. Never reset settings or
  overwrite newer edits from stale forms.
- `/admin/login`, `/admin` and `/admin/rooms` use server-side authentication.
  Room mutations require the existing active session, exact allowed origin,
  same-site request policy and a session-bound CSRF token. Room detail
  mutations use JSON; room photo uploads use multipart data. Never bypass
  these checks.
- Room creation is draft-only. Publication is an explicit separate action.
  Archived rooms cannot be edited/published. DELETE soft-archives and unpublishes;
  restore leaves a draft. Never permanently delete rooms in this workflow.
- Room write bodies use an allowlist; never accept images, MongoDB operators,
  IDs, timestamps or arbitrary fields. Preserve stored image metadata.
- Room photos use server-side ImageKit uploads only. Keep the private key in
  `server/.env`; require the existing admin session, origin and CSRF checks.
  Limit uploads to five JPEG/PNG/WebP images per room, 5 MB each. Store only
  ImageKit metadata in MongoDB, keep failed deletions in the durable cleanup
  queue, and never allow arbitrary asset IDs or URL editing.
- Restaurant menu items allow one optional server-side ImageKit photo each.
  Keep the room and restaurant ImageKit folders separate; require the existing
  admin session, origin and CSRF checks. Validate JPEG/PNG/WebP signatures and
  decoded content, cap photos at 5 MB, version-check mutations, and retain
  durable cleanup records. Never add public upload endpoints or arbitrary asset
  ID/URL editing.
- The application is single-hotel: Room records are scoped by the existing
  `manglam_hotel` database. Do not introduce cross-database access.
- `/admin/restaurant` and `/api/admin/menu` use the same active-session, origin,
  JSON and CSRF protection as room management. Menu writes use strict allowlists.
- Menu item photo uploads/replacements use the protected multipart image
  endpoint, one JPEG/PNG/WebP photo up to 5 MB per item, signature and decoder
  validation, version-checked mutations, and durable ImageKit cleanup records.
  Do not accept arbitrary asset IDs or URL editing.
- Categories and dishes start as drafts; archive unpublishes and restore leaves
  drafts. Never cascade-delete or permanently delete menu records. A category's
  archive/publication gates its dishes publicly without rewriting those dishes.
- Category slugs are generated uniquely and remain stable on rename. Canonical
  nameKey values have a partial unique index; legacy names are checked on writes.
  Do not backfill or migrate existing production records without authorization.
- Dish category references must exist and must not be archived on assignment,
  publication or restoration. Availability is independent of publication:
  unavailable published dishes remain visible with Currently unavailable text.
  Prices are optional INR numbers with at most two decimals; null clears them.
  Manglam Restaurant is 100% vegetarian. Show one restaurant-level label; never
  offer per-dish vegetarian controls or expose legacy vegetarian values.
  Menu items use categories (1?50 unique ObjectIds) and optional tags (up to 15,
  40 characters each, normalized lowercase). Read legacy category only when
  categories is absent; never backfill at startup. Public visibility requires
  at least one published, nonarchived category and a published, active dish.
  Preserve existing image metadata. See docs/menu-schema-evolution.md before
  changing compatibility fields, indexes or running any manual migration.

## Contact content

Render exactly in this order (also preserve DOM order on mobile):

1. Phone numbers: `+91 7568647755`, then `+91 9828809155`.
2. Instagram: https://www.instagram.com/thehouseofmanglam/
3. Hotel location:
   XHMX+X8, Jaipur Phalodi Express Way,
   Kalwar Rd, Radha Krishna Enclave Scheme,
   Kalwad, Rajasthan 303706

Google Maps listing:
https://www.google.com/maps/place/MANGLAM+HOTEL+%26+RESTAURANT/@26.9828396,75.5950936,672m/data=!3m2!1e3!4b1!4m6!3m5!1s0x396c4f8aaa4eaf61:0x236a45148382adb6!8m2!3d26.9828396!4d75.5976685!16s%2Fg%2F11f60z2g14

The confirmed client contact details remain centralized in
`client/src/config/contact.js` as the fallback. The approved public settings API
uses an idempotently seeded copy in MongoDB; do not add a public settings
mutation endpoint.

## Repository conventions

- Inspect the checkout and any existing changes before editing.
- Use Node.js 24 LTS and npm 11+. Install from the repository root.
- Keep a single root `package-lock.json`; use `npm ci` for reproducible installs.
- Client: `src/app` for routing, `components/layout` for the shared shell,
  `components/ui` for reusable UI, `pages` for route screens, `config` for
  public configuration, `services` for API calls, and `styles` for global CSS.
  Add feature-local hooks/components as actual features need them.
- Server: `src/app.js` composes middleware without binding a port;
  `src/index.js` handles process lifecycle; `routes`, `middleware` and `config`
  hold their respective concerns. Add models/controllers/services when used.
- Use ES modules, function components, two-space indentation, semicolons,
  and descriptive names. Avoid unused abstractions and dependencies.
- Tailwind uses the Vite plugin and CSS-first tokens in `styles/index.css`.
- Keep API endpoints under `/api`. Return JSON errors without stack traces.
- Development uses Vite's `/api` proxy. Production should route `/api` to
  Express on the same origin. Do not introduce permissive CORS by default.
- Mongoose connects to `manglam_hotel` for public read-only content APIs and
  authenticated room management. Public rooms must match `isPublished: true`
  and `isArchived: { $ne: true }` (legacy records may lack the archive field).
- Admin password hashes use Argon2id; sessions and rate-limit buckets are
  stored in MongoDB. Never add public registration or expose credential/session
  tokens. Production requires exact HTTPS `ADMIN_ALLOWED_ORIGINS`; configure
  `TRUST_PROXY_HOPS` only for controlled reverse proxies.
- A database outage must return 503 from database-backed APIs, not a success-shaped empty response.
- Never commit secrets, `.env` files, dependencies, build outputs or keys.
  `.env.example` must contain only safe defaults and blank future credentials.
  `VITE_*` values are public and must never contain server secrets.
- Make only requested changes; do not publish or deploy without an instruction.

## Experience and accessibility

- Premium, restrained visual style; mobile-first, responsive layouts.
- Use semantic landmarks, one page h1, logical headings, descriptive links,
  visible focus indicators, keyboard navigation and touch targets >=44px.
- Keep the skip link and route focus/scroll restoration.
- `client/src/data/rooms.js` documents the frontend Room contract; published
  room content is fetched from the public API. `RoomsListing` accepts room
  records as props. Do not put test records in production data modules or ship
  synthetic hotel content.
- Keep room prices optional, images accessible, galleries keyboard-operable,
  and missing/broken-image fallbacks explicit. No gallery autoplay.
- All room enquiry actions lead to `/contact` without a full-page reload.
- Routing uses `createBrowserRouter` and `ScrollRestoration`. Use React Router
  links for internal navigation; preserve history and back/forward scroll.
- Keep the mobile menu accessible with expanded state, Escape dismissal and
  focus return. The location shortcut remains visible at all viewport sizes.
- External Maps and Instagram links open in a new tab with `noopener noreferrer`
  and an accessible new-tab hint. Keep phone links as `tel:` anchors.
- Honor reduced-motion settings. Prefer lightweight CSS transitions.
- Use system fonts initially; optimize approved images when supplied.
- Keep titles and descriptions specific to routes. Admin and not-found pages
  must be noindex. Set canonical URLs, sitemap and social assets only after
  the real production domain/assets are provided.
- SPA metadata is an initial foundation; production SEO may require
  prerendering and host-level 404 handling in a later phase.

## Validation and handoff

- Run `npm run check` (lint, API tests, client build) after relevant changes.
- For navigation or responsive UI changes, run `npm run test:e2e`. First-time
  browser setup: `npx playwright install chromium`. Browser tests cover 360,
  393, 768, 1024 and 1440px widths. Screenshots are in ignored `test-results/`.
  Admin auth tests use isolated test fixtures only; never create test accounts
  in the configured MongoDB database.
- Room API/browser tests use `tests/fixtures/roomServer.js`: real Express/auth
  handlers and Mongoose validation with in-memory persistence, no DB connection.
  Browser tests must intercept all APIs into the fixture, never fall through to
  Atlas for room-management tests. Do not read or change `server/.env` for tests.
- Restaurant API/browser tests extend that same isolated fixture with menu model
  validation and simulated unique indexes. No production menu data is seeded.
- Validate actual client/server startup and the Vite `/api/health` proxy when
  changing workspace scripts, ports or startup configuration.
- Add tests for meaningful behavior/security boundaries, not cosmetic markup.
- Report validation results, limitations and remaining setup honestly.
- Do not describe the scaffold as a finished production deployment.
