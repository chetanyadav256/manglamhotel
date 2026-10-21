import { MapPin, Navigation } from 'lucide-react';
import ExternalLink from '../ui/ExternalLink.jsx';
import { useSiteSettings } from '../../app/SiteSettingsContext.js';

export default function LocationSection() {
  const settings = useSiteSettings();
  return (
    <section className="page-container location-section" aria-labelledby="visit-heading">
      <div className="location-panel">
        <div className="location-emblem" aria-hidden="true"><MapPin strokeWidth={1} size={48} /><span>RAJASTHAN</span></div>
        <div className="location-copy">
          <p className="eyebrow">We look forward to welcoming you</p>
          <h2 id="visit-heading" className="display-heading mt-3">Find your way to Manglam.</h2>
          <address className="mt-5 whitespace-pre-line text-sm leading-7 text-muted not-italic">{settings.address}</address>
        </div>
        <ExternalLink href={settings.maps}><Navigation size={17} aria-hidden="true" />Get Directions</ExternalLink>
      </div>
    </section>
  );
}
