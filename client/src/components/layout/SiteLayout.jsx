import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Outlet, ScrollRestoration, useLocation } from 'react-router';
import Navbar from './Navbar.jsx';
import Footer from './Footer.jsx';
import { SiteSettingsContext, toPublicSiteSettings } from '../../app/SiteSettingsContext.js';
import useApiData from '../../hooks/useApiData.js';
import { getSiteSettings } from '../../services/api.js';
import SiteMetadata from '../seo/SiteMetadata.jsx';

export default function SiteLayout() {
  const { pathname, key } = useLocation();
  const mainRef = useRef(null);
  const previousPath = useRef(pathname);
  const loadSettings = useCallback(({ signal }) => getSiteSettings({ signal }), []);
  const { data } = useApiData(loadSettings, pathname);
  const settings = useMemo(() => toPublicSiteSettings(data), [data]);

  useEffect(() => {
    if (previousPath.current !== pathname) {
      mainRef.current?.focus({ preventScroll: true });
      previousPath.current = pathname;
    }
  }, [pathname]);

  return (
    <SiteSettingsContext.Provider value={settings}>
      <div className="flex min-h-dvh flex-col">
        <SiteMetadata />
        <a href="#main-content" className="skip-link">Skip to content</a>
        <Navbar key={key} />
        <main id="main-content" ref={mainRef} tabIndex={-1} className={pathname === '/' ? 'flex-1 outline-none' : 'page-container flex-1 py-12 outline-none sm:py-20'}>
          <Outlet />
        </main>
        <Footer />
        <ScrollRestoration />
      </div>
    </SiteSettingsContext.Provider>
  );
}
