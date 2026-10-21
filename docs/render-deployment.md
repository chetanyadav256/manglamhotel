# Render production preparation

This guide prepares one Render Node.js Web Service to serve the React build and
Express API from the same origin. No deployment has been performed. Render Free
is not recommended for a business-critical hotel site because it can sleep,
has an ephemeral filesystem, and has no uptime guarantee.
See Render's current [web service](https://render.com/docs/web-services) and
[Free instance limitations](https://render.com/docs/free) documentation.

## Render service configuration

Create one **Web Service** connected to the approved GitHub repository:

| Setting | Value |
| --- | --- |
| Root Directory | Repository root (leave blank) |
| Runtime | Node |
| Node version | Node 24 LTS (the root `engines` field requires Node 24) |
| Build Command | `npm ci && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |
| Plan | Free only for evaluation; choose an always-on paid plan for dependable public access |

The root build script runs Vite and writes `client/dist`. The root start script
starts Express, which serves that build, the API, `robots.txt`, and `sitemap.xml`.
Do not set a separate static-site service, a Vite preview server, or a second
API service for this architecture. Render supplies `PORT`; the server binds to
`0.0.0.0` in production. Browser API requests use same-origin `/api`.

Set the service's public URL once Render assigns it (or use the chosen
canonical custom domain). Do not include a trailing slash in origin settings.
For example, the format is `https://your-service.onrender.com`; this is an
example format, not a configured hotel domain.

## Environment variables

Set these in the Render dashboard's Environment page. Never paste secrets into
Git, this guide, browser configuration, or support logs.

| Variable | Requirement |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` | Leave unset; Render provides it |
| `MONGODB_URI` | Required secret; Atlas URI for the existing `manglam_hotel` database |
| `IMAGEKIT_PRIVATE_KEY` | Required secret; existing ImageKit private key |
| `ADMIN_ALLOWED_ORIGINS` | Required; comma-separated exact HTTPS origins used by the site |
| `PUBLIC_SITE_URL` | Required; one exact HTTPS canonical site origin, without a trailing slash |
| `TRUST_PROXY_HOPS` | `1` for Render's directly connected reverse proxy; verify if adding a proxy layer |

`PUBLIC_SITE_URL` must also be included exactly in `ADMIN_ALLOWED_ORIGINS`.
If a custom domain is the canonical URL, use it for `PUBLIC_SITE_URL` and include
all accepted browser origins in `ADMIN_ALLOWED_ORIGINS`. Do not add a wildcard
or an HTTP origin. Production startup rejects missing Atlas, ImageKit, public
URL, and allowed-origin configuration.

The safe local examples are in [`server/.env.example`](../server/.env.example)
and [`client/.env.example`](../client/.env.example). `VITE_*` values are public
build-time values. Keep `VITE_API_BASE_URL` at `/api`; never put secrets in it.
Do not add `HOST=127.0.0.1` as a Render variable.

## MongoDB Atlas

1. Confirm the existing Atlas cluster, database user permissions, and
   `manglam_hotel` database. Do not run seed/reset commands during deployment.
2. In Render's service details, open **Connect → Outbound** and use the
   [service's current regional outbound IP ranges](https://render.com/docs/outbound-ip-addresses) in the Atlas Network Access
   list. These ranges are shared by services in that region; review them if the
   service region changes. Do not use `0.0.0.0/0` as a shortcut.
3. Keep the database user least-privileged for the application operations it
   needs. Use Atlas TLS and a URL-encoded credential in `MONGODB_URI`.
4. Before starting the web service, independently confirm the existing
   production settings and administrator account. The startup settings seed is
   idempotent, but deployment does not need to seed or mutate records.

Render Free has no persistent application disk. This app keeps database data in
MongoDB and durable photographs in ImageKit; temporary multipart upload files
are stored under the operating-system temp directory and removed after each
request. A restart may discard those temporary files, which is expected. The
ImageKit cleanup queue is stored in MongoDB and resumes when the process starts.
Never use the Render filesystem as permanent media storage.

## ImageKit

Set the existing private key only as `IMAGEKIT_PRIVATE_KEY` in Render's secret
environment settings. Confirm the account is active and the existing
`/manglam-hotel/rooms/` and `/manglam-hotel/restaurant/` folder conventions work.
Uploads remain authenticated and server-side. The browser receives image URLs,
not the private key. No restaurant images or settings are reset by deployment.

## Authentication and HTTPS verification

Render terminates HTTPS for a Web Service. Before accepting real changes:

1. Open the public site using its HTTPS URL and confirm there is no mixed
   content.
2. Confirm `/admin/login` loads over HTTPS, then sign in using the pre-existing
   administrator account. No password or session token should appear in the
   browser's local storage.
3. Confirm the session survives refresh, logout revokes it, and a fresh
   unauthenticated `/admin` visit returns to login.
4. Confirm the session cookie is Secure, HttpOnly, host-only (`__Host-`), and
   same-site. Confirm protected mutations fail without the session, exact
   origin and CSRF token.
5. Verify a room/menu edit only after reviewing its effect. Do not perform
   destructive changes to production content as a smoke test.

Do not use a permissive CORS rule or disable CSRF/origin checks to work around
configuration mistakes. `TRUST_PROXY_HOPS` controls Express's trust of
forwarded headers and must match the controlled Render ingress path.

## Health, routing, API and SEO checks

- `GET /api/health` should return `200` JSON. It is a process liveness check and
  does not prove Atlas is available.
- Check `GET /api/site-settings`, `GET /api/rooms`,
  `GET /api/menu/categories`, and `GET /api/menu/items`; a database outage
  should return `503`, not a fabricated empty success.
- Directly open and refresh `/`, `/rooms`, `/restaurant`, `/contact`,
  `/admin/login`, and `/admin/rooms`. Public page requests should receive
  route-specific title/description, canonical URL, and Open Graph metadata.
  Admin requests should be `noindex` and have no canonical URL.
- An unknown `/api/...` request must be a JSON `404`, never `index.html`.
- Check `/robots.txt` and `/sitemap.xml`. The sitemap includes only public
  pages, never admin routes.
- Verify a built JS/CSS file under `/assets/` has immutable one-year caching;
  the SPA HTML should revalidate.
- Check one approved room and menu photo if present. No room or menu content is
  fabricated when the collections are empty.

## SEO and React SPA limitations

The server injects route-specific title, description, robots, canonical and
Open Graph metadata into the initial HTML, but the page body is a React SPA
shell. Page content, settings-backed structured data, and some later metadata
updates require client-side JavaScript. This is not full server rendering or
prerendering. Google can render JavaScript, but rendering may be delayed or
unavailable to other crawlers and social preview bots. If organic discovery is
important, use a maintained prerendering/SSR approach for the four public
routes after real content and the canonical domain are verified. Never include
admin routes or unpublished content in a prerender.

Structured data describes only the confirmed hotel/restaurant name, phone,
address, Instagram, and Maps listing. It deliberately contains no invented
reviews, ratings, opening hours, amenities, menu prices, or availability.

**Render Free has an important robots limitation:** after 15 minutes without
inbound traffic, the web service spins down. A wake-up can take about a
minute. While the Free service is asleep, Render itself responds to
`/robots.txt` with a standard disallow-all response; that request does not wake
the app. Crawlers may therefore see the entire site disallowed during idle
periods, harming indexing and business SEO. The app cannot override this
platform response or safely work around the idle policy. A paid always-on
service is the dependable option for indexing and customer availability.
Never use automated keep-alive traffic to bypass the Free policy.
See Render's current [Free web service documentation](https://render.com/docs/free#free-web-services)
before selecting a plan.

## Deployment troubleshooting

- **Build cannot find a workspace or lockfile:** ensure the Render Root
  Directory is the repository root and the root `package-lock.json` is present.
- **Startup fails with missing environment variables:** add each required
  variable above; verify the URL is an exact HTTPS origin and is included in
  `ADMIN_ALLOWED_ORIGINS`.
- **Health check fails or the service is unreachable:** check deploy logs for
  startup errors, confirm Render's `PORT` was not overridden, and confirm the
  server binds to `0.0.0.0`.
- **Database-backed APIs return 503:** verify Atlas availability, the
  `manglam_hotel` user/database, URI encoding, and Render outbound IP ranges in
  Atlas Network Access. Do not expose the URI when diagnosing.
- **Admin login/session fails:** confirm the browser is on the exact allowed
  HTTPS origin, `TRUST_PROXY_HOPS` matches Render, and browser requests use
  same-origin `/api`. Do not weaken cookie, CSRF, or origin requirements.
- **Images are unavailable:** check ImageKit account/key and the stored
  metadata/asset in the ImageKit dashboard. Do not delete assets to test
  connectivity.
- **Canonical or sitemap URLs are wrong:** correct `PUBLIC_SITE_URL` to the
  one canonical origin, include it in allowed origins, and redeploy.

Render Free does not provide a production shell for this runbook. Diagnose from
deploy logs, the dashboard, health/API responses, Atlas, and ImageKit dashboards.
Never assume shell access or use a shell command as a deployment prerequisite.

## Rollback

Use the Render dashboard's **Deploys** history to redeploy the last known-good
build. Confirm the previous release passes the health and public route checks.
The release rollback does not revert MongoDB settings/content, sessions, or
ImageKit assets. Do not restore database snapshots or run a destructive
migration as part of an application rollback.

## Pre-deployment checklist

- [ ] Review the pending Git diff and approve/push it to the intended branch.
- [ ] Confirm the selected Node version is 24 and the lockfile is current.
- [ ] Set the service URL, production secrets, exact origins and proxy hops.
- [ ] Add the Render outbound IP ranges to Atlas without opening access to all IPs.
- [ ] Confirm the existing admin account and production hotel settings.
- [ ] Run `npm ci`, `npm run check`, and `npm run test:e2e` locally.
- [ ] Build and smoke-test Express serving `client/dist`, direct SPA routes,
      JSON API errors, metadata, sitemap, robots, and static asset caching.
- [ ] Decide whether Free-tier downtime and the sleeping `robots.txt` behavior
      are acceptable. Use an always-on plan if business SEO/availability matters.
- [ ] Deploy only after explicit owner approval; deployment is outside this
      preparation task.
