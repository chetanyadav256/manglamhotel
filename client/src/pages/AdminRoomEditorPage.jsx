import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useAdminAuth } from '../app/useAdminAuth.js';
import AdminRoomForm from '../components/admin/AdminRoomForm.jsx';
import ManagementState from '../components/admin/ManagementState.jsx';
import '../styles/admin-rooms.css';
import '../styles/rooms.css';

export default function AdminRoomEditorPage() {
  const { id } = useParams();
  const { request } = useAdminAuth();
  const [loaded, setLoaded] = useState(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    const task = setTimeout(() => {
      setError(''); setLoaded(null);
      request(`/rooms/${encodeURIComponent(id)}`, { signal: controller.signal }).then(({ data }) => {
        if (!controller.signal.aborted) setLoaded({ id, room: data });
      }).catch((failure) => { if (!controller.signal.aborted) setError(failure.message); });
    }, 0);
    return () => { clearTimeout(task); controller.abort(); };
  }, [id, request, retry]);
  return <>
    <p className="eyebrow">Rooms Management</p><h1>{id ? 'Edit room' : 'Add room'}</h1>
    {error ? <><ManagementState error={error} onRetry={() => setRetry((value) => value + 1)} /><Link to="/admin/rooms" className="button button-outline mt-4">Back to rooms</Link></>
      : id && loaded?.id !== id ? <ManagementState loading />
        : id && loaded?.room.isArchived ? <ManagementState>This room is archived. <Link to="/admin/rooms?status=archived" className="contact-link">Restore it from the archive</Link> before editing.</ManagementState>
          : <AdminRoomForm key={id || 'new'} room={id ? loaded.room : undefined} />}
  </>;
}
