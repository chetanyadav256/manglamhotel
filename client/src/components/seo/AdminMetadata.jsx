import { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router';
import { getPageMetadata } from '../../../../shared/seo.js';

export default function AdminMetadata() {
  const { pathname } = useLocation();
  const metadata = useMemo(() => getPageMetadata(pathname), [pathname]);

  useEffect(() => {
    document.title = metadata.title;
    const description = document.querySelector('meta[name="description"]');
    if (description) description.content = metadata.description;
    let robots = document.querySelector('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement('meta');
      robots.name = 'robots';
      document.head.append(robots);
    }
    robots.content = 'noindex, nofollow';
    document.querySelector('link[rel="canonical"]')?.remove();
    document.getElementById('page-og-url')?.remove();
    const structuredData = document.getElementById('site-structured-data');
    if (structuredData) structuredData.textContent = '';
  }, [metadata]);

  return null;
}
