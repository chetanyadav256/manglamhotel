import { MessageCircle } from 'lucide-react';
import ActionLink from '../ui/ActionLink.jsx';

export default function RoomContactBanner() {
  return (
    <section className="room-contact-banner" aria-labelledby="room-contact-heading">
      <div>
        <p className="room-contact-eyebrow"><MessageCircle size={17} aria-hidden="true" /> A personal conversation</p>
        <h2 id="room-contact-heading">Looking for a comfortable stay?</h2>
        <p>Contact Manglam Hotel to enquire about room availability.</p>
      </div>
      <ActionLink to="/contact" variant="light">Contact Hotel</ActionLink>
    </section>
  );
}
