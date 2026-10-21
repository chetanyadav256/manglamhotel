import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';

const publicSiteUrl = 'https://manglam.example';
const buildDirectory = mkdtempSync(join(tmpdir(), 'manglam-production-test-'));
let server;
let baseUrl;

before(async () => {
  mkdirSync(join(buildDirectory, 'assets'));
  writeFileSync(join(buildDirectory, 'index.html'), `<!doctype html><html><head>
    <title id="page-title">__SEO_TITLE__</title>
    <meta id="page-description" name="description" content="__SEO_DESCRIPTION__">
    <meta id="page-robots" name="robots" content="__SEO_ROBOTS__">
    <meta name="public-site-url" content="__PUBLIC_SITE_URL__">
    <!-- SEO_CANONICAL -->
    <!-- SEO_OG_URL -->
    </head><body><div id="root"></div></body></html>`);
  writeFileSync(join(buildDirectory, 'assets', 'app-123abc.js'), 'export default true;');
  const app = createApp({
    serveClient: true,
    clientBuildDirectory: buildDirectory,
    publicSiteUrl,
    adminConfig: { allowedOrigins: [publicSiteUrl], production: true, trustProxyHops: 1 },
    isDatabaseReady: () => true,
  });
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
  rmSync(buildDirectory, { recursive: true, force: true });
});

test('production SPA routes serve route-specific metadata and canonical URLs', async () => {
  const response = await fetch(`${baseUrl}/rooms`, { headers: { Accept: 'text/html' } });
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.equal(response.headers.get('cache-control'), 'no-cache');
  assert.match(html, /<title id="page-title">Rooms &amp; Accommodation \| Manglam Hotel &amp; Restaurant<\/title>/);
  assert.match(html, /name="robots" content="index, follow"/);
  assert.match(html, /rel="canonical" href="https:\/\/manglam\.example\/rooms"/);
  assert.match(html, /property="og:url" content="https:\/\/manglam\.example\/rooms"/);
});

test('admin SPA routes are noindex and do not receive a canonical URL', async () => {
  for (const path of ['/admin/login', '/admin/settings']) {
    const response = await fetch(`${baseUrl}${path}`, { headers: { Accept: 'text/html' } });
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /name="robots" content="noindex, nofollow"/);
    assert.doesNotMatch(html, /rel="canonical"/);
    assert.doesNotMatch(html, /property="og:url"/);
  }
});

test('production static assets receive immutable caching and SPA pages stay revalidatable', async () => {
  const response = await fetch(`${baseUrl}/assets/app-123abc.js`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.equal(await response.text(), 'export default true;');

  const unknownAsset = await fetch(`${baseUrl}/missing.js`, { headers: { Accept: 'text/html' } });
  assert.equal(unknownAsset.status, 404);
  assert.deepEqual(await unknownAsset.json(), { error: { message: 'Route not found.' } });
});

test('production SEO endpoints include only public canonical routes', async () => {
  const robotsResponse = await fetch(`${baseUrl}/robots.txt`);
  assert.equal(robotsResponse.status, 200);
  const robots = await robotsResponse.text();
  assert.match(robots, /Disallow: \/admin/);
  assert.match(robots, /Sitemap: https:\/\/manglam\.example\/sitemap\.xml/);

  const sitemapResponse = await fetch(`${baseUrl}/sitemap.xml`);
  assert.equal(sitemapResponse.status, 200);
  const sitemap = await sitemapResponse.text();
  assert.match(sitemapResponse.headers.get('content-type'), /application\/xml/);
  for (const path of ['/', '/rooms', '/restaurant', '/contact']) {
    assert.ok(sitemap.includes(`https://manglam.example${path === '/' ? '/' : path}`));
  }
  assert.doesNotMatch(sitemap, /admin|api/);
});

test('production deployment continues to return JSON for unknown API routes', async () => {
  const response = await fetch(`${baseUrl}/api/not-a-route`, { headers: { Accept: 'text/html' } });
  assert.equal(response.status, 404);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.deepEqual(await response.json(), { error: { message: 'Route not found.' } });
});
