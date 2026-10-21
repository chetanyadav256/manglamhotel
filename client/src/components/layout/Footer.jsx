import { Link } from 'react-router';
import { ArrowUpRight, Camera, MapPin, Phone } from 'lucide-react';
import Brand from '../ui/Brand.jsx';
import ExternalLink from '../ui/ExternalLink.jsx';
import { contact } from '../../config/contact.js';
import { navigation } from '../../config/navigation.js';

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="page-container">
        <div className="footer-grid">
          <div>
            <Brand light />
            <p className="mt-6 max-w-xs text-sm leading-7 text-white/70">Rooms, dining, and a warm welcome.<br />Find us in Kalwad, Rajasthan.</p>
          </div>
          <div>
            <h2 className="footer-heading">Explore</h2>
            <nav aria-label="Footer navigation" className="flex flex-col items-start">
              {navigation.map(({ to, label }) => <Link key={to} to={to} className="footer-link">{label}</Link>)}
            </nav>
          </div>
          <div>
            <h2 className="footer-heading">Get in touch</h2>
            {contact.phones.map((phone) => (
              <a key={phone.href} href={phone.href} className="footer-link flex gap-3"><Phone size={15} aria-hidden="true" />{phone.label}</a>
            ))}
            <ExternalLink href={contact.instagram} className="footer-link mt-2 flex gap-2"><Camera size={16} aria-hidden="true" />@thehouseofmanglam</ExternalLink>
          </div>
          <div>
            <h2 className="footer-heading">Find Manglam</h2>
            <div className="flex gap-3">
              <MapPin size={18} aria-hidden="true" className="mt-1 shrink-0 text-gold" />
              <address className="text-sm leading-7 text-white/75 not-italic">{contact.address.map((line) => <span key={line} className="block">{line}</span>)}</address>
            </div>
            <a href={contact.maps} target="_blank" rel="noopener noreferrer" className="footer-link mt-3 gap-2">Get directions <ArrowUpRight size={16} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a>
          </div>
        </div>
        <div className="footer-bottom"><p>© {new Date().getFullYear()} Manglam Hotel & Restaurant</p><p>Kalwad, Rajasthan · India</p></div>
      </div>
    </footer>
  );
}
