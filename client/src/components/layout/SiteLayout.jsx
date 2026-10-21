import { useEffect, useRef } from 'react';
import { Outlet, ScrollRestoration, useLocation } from 'react-router';
import Navbar from './Navbar.jsx';
import Footer from './Footer.jsx';

export default function SiteLayout() {
  const { pathname, key } = useLocation();
  const mainRef = useRef(null);
  const previousPath = useRef(pathname);

  useEffect(() => {
    if (previousPath.current !== pathname) {
      mainRef.current?.focus({ preventScroll: true });
      previousPath.current = pathname;
    }
  }, [pathname]);

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <Navbar key={key} />
      <main id="main-content" ref={mainRef} tabIndex={-1} className={pathname === '/' ? 'flex-1 outline-none' : 'page-container flex-1 py-12 outline-none sm:py-20'}>
        <Outlet />
      </main>
      <Footer />
      <ScrollRestoration />
    </div>
  );
}
