import { Router } from 'express';

const publicPaths = ['/', '/rooms', '/restaurant', '/contact'];

function escapeXml(value) {
  return value.replace(/[<>&'"]/g, (character) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;',
  })[character]);
}

export function createSeoRouter({ publicSiteUrl = '' } = {}) {
  const router = Router();

  router.get('/robots.txt', (_request, response) => {
    const lines = [
      'User-agent: *',
      'Allow: /',
      'Disallow: /admin',
      'Disallow: /api/admin/',
    ];
    if (publicSiteUrl) lines.push(`Sitemap: ${publicSiteUrl}/sitemap.xml`);
    response.type('text/plain').set('Cache-Control', 'public, max-age=3600').send(`${lines.join('\n')}\n`);
  });

  router.get('/sitemap.xml', (_request, response) => {
    if (!publicSiteUrl) {
      response.status(503).type('text/plain').send('Set PUBLIC_SITE_URL to enable the sitemap.');
      return;
    }
    const urls = publicPaths.map((pathname) => (
      `<url><loc>${escapeXml(`${publicSiteUrl}${pathname === '/' ? '/' : pathname}`)}</loc></url>`
    ));
    response
      .type('application/xml')
      .set('Cache-Control', 'public, max-age=3600')
      .send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`);
  });

  return router;
}
