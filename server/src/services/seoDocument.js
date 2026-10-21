import { getPageMetadata } from '../../../shared/seo.js';

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

export function renderSeoDocument(template, pathname, publicSiteUrl = '') {
  const metadata = getPageMetadata(pathname);
  const canonicalTag = metadata.canonicalPath && publicSiteUrl
    ? `<link rel="canonical" href="${escapeHtml(`${publicSiteUrl}${metadata.canonicalPath === '/' ? '/' : metadata.canonicalPath}`)}" />`
    : '';
  const openGraphUrlTag = metadata.canonicalPath && publicSiteUrl
    ? `<meta id="page-og-url" property="og:url" content="${escapeHtml(`${publicSiteUrl}${metadata.canonicalPath === '/' ? '/' : metadata.canonicalPath}`)}" />`
    : '';
  return template
    .replaceAll('__SEO_TITLE__', escapeHtml(metadata.title))
    .replaceAll('__SEO_DESCRIPTION__', escapeHtml(metadata.description))
    .replaceAll('__SEO_ROBOTS__', metadata.noIndex ? 'noindex, nofollow' : 'index, follow')
    .replace('<!-- SEO_CANONICAL -->', canonicalTag)
    .replace('<!-- SEO_OG_URL -->', openGraphUrlTag)
    .replace('__PUBLIC_SITE_URL__', escapeHtml(publicSiteUrl));
}
