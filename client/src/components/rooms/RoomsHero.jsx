import { MapPin } from 'lucide-react';
import ActionLink from '../ui/ActionLink.jsx';
import ArchIllustration from '../ui/ArchIllustration.jsx';

export default function RoomsHero() {
  return (
    <section className="rooms-hero" aria-labelledby="rooms-heading">
      <div className="rooms-hero-copy">
        <p className="eyebrow flex items-center gap-2"><span className="gold-rule" /> Make yourself at home</p>
        <h1 id="rooms-heading">Rooms & <br />Accommodation</h1>
        <p className="rooms-hero-description">Your next visit starts here.</p>
        <p className="rooms-hero-text">Planning a stay in Kalwad? Speak with the Manglam team about room details, current prices and availability before your visit.</p>
        <ActionLink to="/contact">Enquire Now</ActionLink>
        <p className="rooms-hero-note"><MapPin size={15} aria-hidden="true" /> Manglam Hotel · Kalwad, Rajasthan</p>
      </div>
      <div className="rooms-hero-art">
        <ArchIllustration />
        <p className="art-caption">An illustration inspired by Rajasthan</p>
      </div>
    </section>
  );
}
