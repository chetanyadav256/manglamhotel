import { Link } from 'react-router';
import RoomStatus from './RoomStatus.jsx';

const dateLabel = (value) => value ? new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', timeZoneName: 'short' }) : 'Not recorded';

export default function AdminRoomListItem({ room, actions, onAction }) {
  return <article className="admin-room-row" aria-label={room.name}>
    <div>
      <RoomStatus room={room} /><h2>{room.name}</h2>
      <p>{room.pricePerNight == null ? 'Price not provided' : `${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(room.pricePerNight)} / night`}</p>
      <p className="admin-field-hint">Display order: {room.displayOrder}</p>
    </div>
    <dl className="admin-room-dates"><div><dt>Created</dt><dd>{dateLabel(room.createdAt)}</dd></div><div><dt>Updated</dt><dd>{dateLabel(room.updatedAt)}</dd></div></dl>
    <div className="admin-room-actions">
      {!room.isArchived && <Link to={`/admin/rooms/${room.id}/edit`} className="button button-outline">Edit room</Link>}
      {(room.isArchived ? ['restore'] : [room.isPublished ? 'unpublish' : 'publish', 'archive']).map((type) => <button key={type} className="button button-outline" type="button" onClick={() => onAction(type)}>{actions[type].label}</button>)}
    </div>
  </article>;
}
