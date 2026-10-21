import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router';
import { MapPin, Menu, X } from 'lucide-react';
import Brand from '../ui/Brand.jsx';
import { navigation } from '../../config/navigation.js';
import { useSiteSettings } from '../../app/SiteSettingsContext.js';

export default function Navbar() {
  const settings = useSiteSettings();
  const location = useLocation();
  const [openForLocation, setOpenForLocation] = useState(null);
  const isOpen = openForLocation === location.key;
  const toggleRef = useRef(null);
  const headerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        setOpenForLocation(null);
        toggleRef.current?.focus();
      }
    }
    function onPointerDown(event) {
      if (!headerRef.current?.contains(event.target)) setOpenForLocation(null);
    }
    const desktop = window.matchMedia('(min-width: 1024px)');
    function onResize(event) {
      if (event.matches) setOpenForLocation(null);
    }
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    desktop.addEventListener('change', onResize);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
      desktop.removeEventListener('change', onResize);
    };
  }, [isOpen]);

  return (
    <header ref={headerRef} className="site-header">
      <div className="page-container navbar">
        <Brand />
        <nav aria-label="Main navigation" className="desktop-nav">
          {navigation.map(({ to, label }) => (
            <NavLink key={to} to={to} end={to === '/'} className="nav-link">{label}</NavLink>
          ))}
        </nav>
        <div className="navbar-actions">
          <a href={settings.maps} target="_blank" rel="noopener noreferrer" className="nav-location" aria-label={`${settings.hotelName} location (opens Google Maps in a new tab)`}>
            <MapPin size={20} strokeWidth={1.7} aria-hidden="true" />
            <span className="hidden lg:inline">Location</span>
          </a>
          <button ref={toggleRef} type="button" className="menu-toggle" aria-label={isOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={isOpen} aria-controls="mobile-navigation" onClick={() => setOpenForLocation(isOpen ? null : location.key)}>
            {isOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
          </button>
        </div>
      </div>
      <nav id="mobile-navigation" aria-label="Mobile navigation" className="mobile-nav" hidden={!isOpen}>
        <div className="page-container pb-5">
          {navigation.map(({ to, label }) => (
            <NavLink key={to} to={to} end={to === '/'} className="nav-link" onClick={() => setOpenForLocation(null)}>{label}</NavLink>
          ))}
        </div>
      </nav>
    </header>
  );
}
