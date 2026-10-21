import { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router';
import { createStructuredData, getPageMetadata } from '../../../../shared/seo.js';
import { useSiteSettings } from '../../app/SiteSettingsContext.js';

function updateMeta({ id, name, property, content }) {
  let element = document.getElementById(id);
  if (!content) {
    element?.remove();
    return;
  }
  if (!element) {
    element = document.createElement('meta');
    element.id = id;
    if (name) element.name = name;
    if (property) element.setAttribute('property', property);
    document.head.append(element);
  }
  element.content = content;
}

export default function SiteMetadata() {
  const { pathname } = useLocation();
  const settings = useSiteSettings();
  const metadata = useMemo(() => getPageMetadata(pathname, settings.hotelName), [pathname, settings.hotelName]);

  useEffect(() => {
    document.title = metadata.title;
    updateMeta({ id: 'page-description', name: 'description', content: metadata.description });
    updateMeta({
      id: 'page-robots',
      name: 'robots',
      content: metadata.noIndex ? 'noindex, nofollow' : 'index, follow',
    });
    updateMeta({ id: 'page-og-title', property: 'og:title', content: metadata.title });
    updateMeta({ id: 'page-og-description', property: 'og:description', content: metadata.description });

    const publicSiteUrl = document.querySelector('meta[name="public-site-url"]')?.content.trim() || '';
    const pageUrl = metadata.canonicalPath && publicSiteUrl
      ? `${publicSiteUrl}${metadata.canonicalPath === '/' ? '/' : metadata.canonicalPath}`
      : '';
    let canonical = document.querySelector('link[rel="canonical"]');
    if (pageUrl) {
      if (!canonical) {
        canonical = document.createElement('link');
        canonical.rel = 'canonical';
        document.head.append(canonical);
      }
      canonical.href = pageUrl;
    } else {
      canonical?.remove();
    }
    updateMeta({ id: 'page-og-url', property: 'og:url', content: pageUrl });

    const structuredData = document.getElementById('site-structured-data');
    if (structuredData) {
      structuredData.textContent = JSON.stringify(createStructuredData(settings, publicSiteUrl))
        .replace(/</g, '\\u003c');
    }
  }, [metadata, settings]);

  return null;
}
