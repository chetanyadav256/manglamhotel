import { Link } from 'react-router';
import { ArrowUpRight, Camera, MapPin, Phone } from 'lucide-react';
import Brand from '../ui/Brand.jsx';
import ExternalLink from '../ui/ExternalLink.jsx';
import { navigation } from '../../config/navigation.js';
import { useSiteSettings } from '../../app/SiteSettingsContext.js';

export default function Footer() {
  const settings = useSiteSettings();
  return (
    <footer className="site-footer">
      <div className="page-container">
        <div className="footer-grid">
          <div>
            <Brand light />
            <p className="mt-6 max-w-xs text-sm leading-7 text-white/70">Rooms, dining, and a warm welcome.<br />Contact our team to plan your visit.</p>
          </div>
          <div>
            <h2 className="footer-heading">Explore</h2>
            <nav aria-label="Footer navigation" className="flex flex-col items-start">
              {navigation.map(({ to, label }) => <Link key={to} to={to} className="footer-link">{label}</Link>)}
            </nav>
          </div>
          <div>
            <h2 className="footer-heading">Get in touch</h2>
            {settings.phones.map((phone) => (
              <a key={phone.href} href={phone.href} className="footer-link flex gap-3"><Phone size={15} aria-hidden="true" />{phone.label}</a>
            ))}
            <ExternalLink href={settings.instagram} className="footer-link mt-2 flex gap-2"><Camera size={16} aria-hidden="true" />Instagram profile</ExternalLink>
          </div>
          <div>
            <h2 className="footer-heading">Find Manglam</h2>
            <div className="flex gap-3">
              <MapPin size={18} aria-hidden="true" className="mt-1 shrink-0 text-gold" />
              <address className="whitespace-pre-line text-sm leading-7 text-white/75 not-italic">{settings.address}</address>
            </div>
            <a href={settings.maps} target="_blank" rel="noopener noreferrer" className="footer-link mt-3 gap-2">Get directions <ArrowUpRight size={16} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a>
          </div>
        </div>
        <div className="footer-bottom"><p>© {new Date().getFullYear()} {settings.hotelName}</p><p>India</p></div>
      </div>
    </footer>
  );
}
