import { useId } from 'react';
import { Check } from 'lucide-react';
import ActionLink from '../ui/ActionLink.jsx';
import RoomGallery from './RoomGallery.jsx';

function formatPrice(price) {
  if (!price || !Number.isFinite(price.amount) || price.amount < 0 || !price.currency) return null;
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: price.currency,
      maximumFractionDigits: 2,
    }).format(price.amount);
  } catch {
    return null;
  }
}

/** @param {{room: import('../../data/rooms.js').Room}} props */
export default function RoomCard({ room }) {
  const headingId = useId();
  const price = formatPrice(room.pricePerNight);
  const amenities = (room.amenities ?? []).filter((amenity) => typeof amenity === 'string' && amenity.trim());

  return (
    <article className="room-card" aria-labelledby={headingId}>
      <RoomGallery key={JSON.stringify(room.images ?? [])} images={room.images ?? []} roomName={room.name} />
      <div className="room-card-body">
        <h3 id={headingId}>{room.name}</h3>
        {room.description && <p className="room-description">{room.description}</p>}
        {amenities.length > 0 && (
          <ul className="room-amenities" aria-label={`Amenities for ${room.name}`}>
            {amenities.map((amenity, index) => <li key={`${amenity}-${index}`}><Check size={15} aria-hidden="true" /><span>{amenity}</span></li>)}
          </ul>
        )}
        <div className="room-card-enquiry">
          {price
            ? <p className="room-price">{price}<span> per night</span></p>
            : <p className="room-price-note">Contact the hotel for current prices.</p>}
          <ActionLink to="/contact">Enquire Now</ActionLink>
          <p className="room-price-note">Please contact our team to check availability.</p>
        </div>
      </div>
    </article>
  );
}
