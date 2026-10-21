export default function RoomStatus({ room }) {
  return <span className={`admin-room-status status-${room.isArchived ? 'archived' : room.isPublished ? 'published' : 'draft'}`}>{room.isArchived ? 'Archived · Unpublished' : room.isPublished ? 'Published' : 'Draft · Unpublished'}</span>;
}
