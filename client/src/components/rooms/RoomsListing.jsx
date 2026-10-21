import { BedDouble } from 'lucide-react';
import ActionLink from '../ui/ActionLink.jsx';
import RoomCard from './RoomCard.jsx';

export default function RoomsListing({ rooms, error = false, loading = false, onRetry }) {
  return (
    <section className="rooms-listing" aria-labelledby="room-listing-heading">
      <div className="rooms-section-intro">
        <div>
          <p className="eyebrow">Explore your stay</p>
          <h2 id="room-listing-heading" className="display-heading">Rooms at Manglam</h2>
        </div>
        <p>For current room information and availability, speak directly with our team.</p>
      </div>
      {loading ? (
        <p className="rooms-empty-state" role="status">Loading room information…</p>
      ) : error ? (
        <div className="rooms-empty-state" role="alert">
          <p className="eyebrow">Room information unavailable</p>
          <h3>We couldn’t load room details.</h3>
          <p className="rooms-empty-description">Please try again, or contact Manglam Hotel for room information.</p>
          <button type="button" className="button button-primary" onClick={onRetry}>Try again</button>
        </div>
      ) : rooms.length > 0 ? (
        <div className="rooms-grid">{rooms.map((room) => <RoomCard key={room.id} room={room} />)}</div>
      ) : (
        <div className="rooms-empty-state">
          <span className="rooms-empty-icon"><BedDouble size={34} strokeWidth={1.2} aria-hidden="true" /></span>
          <p className="eyebrow">Let’s help you plan your stay</p>
          <h3>Room details, a conversation away.</h3>
          <p className="rooms-empty-description">For room availability and details, please contact Manglam Hotel.</p>
          <ActionLink to="/contact">Enquire About Rooms</ActionLink>
          <p className="rooms-empty-note">Room descriptions and photographs will be shared here once available.</p>
        </div>
      )}
    </section>
  );
}
