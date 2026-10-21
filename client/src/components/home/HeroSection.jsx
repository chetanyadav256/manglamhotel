import { ArrowDown, MapPin } from 'lucide-react';
import ArchIllustration from '../ui/ArchIllustration.jsx';
import ActionLink from '../ui/ActionLink.jsx';
import { useSiteSettings } from '../../app/SiteSettingsContext.js';

export default function HeroSection() {
  const settings = useSiteSettings();
  return (
    <section className="hero-section" aria-labelledby="welcome-heading">
      <div className="page-container hero-grid">
        <div className="hero-copy">
          <p className="eyebrow flex items-center gap-2"><span className="gold-rule" /> A welcome from Rajasthan</p>
          <h1 id="welcome-heading">Welcome to<br /><em>Manglam.</em></h1>
          <p className="hero-description">A place to pause.<br className="hidden sm:block" /> A reason to come together.</p>
          <p className="mt-4 max-w-md text-sm leading-7 text-muted">Discover {settings.hotelName}. Explore our rooms, find out about our restaurant, and plan your visit with us.</p>
          <div className="hero-mobile-actions"><ActionLink to="/rooms">Explore Rooms</ActionLink><ActionLink to="/restaurant" variant="outline">View Menu</ActionLink></div>
          <a href="#explore" className="hero-discover"><span className="flex size-10 items-center justify-center rounded-full border border-line"><ArrowDown size={16} aria-hidden="true" /></span>Make yourself at home</a>
        </div>
        <div className="hero-art">
          <div className="hero-art-label"><MapPin size={14} aria-hidden="true" /> KALWAD, RAJASTHAN</div>
          <ArchIllustration />
          <p className="art-caption">An illustration inspired by Rajasthan</p>
        </div>
      </div>
    </section>
  );
}
