import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { useAdminAuth } from '../app/useAdminAuth.js';
import ConfirmDialog from '../components/admin/ConfirmDialog.jsx';
import ManagementState from '../components/admin/ManagementState.jsx';
import AdminRoomListItem from '../components/admin/AdminRoomListItem.jsx';
import '../styles/admin-rooms.css';

const actions = {
  publish: { title: 'Publish room?', label: 'Publish room', message: 'This room and its supplied details will become visible on the public Rooms page.', method: 'PATCH', body: { isPublished: true } },
  unpublish: { title: 'Unpublish room?', label: 'Unpublish room', message: 'This room will be hidden from public listings.', method: 'PATCH', body: { isPublished: false } },
  archive: { title: 'Archive room?', label: 'Archive room', message: 'This hides and unpublishes the room. Its details and images are kept, and it can be restored later.', method: 'DELETE', body: {} },
  restore: { title: 'Restore room?', label: 'Restore room', message: 'This room will return as a draft. You must publish it separately to make it public.', method: 'POST', body: {} },
};

export default function AdminRoomsPage() {
  const { request } = useAdminAuth();
  const [params, setParams] = useSearchParams();
  const { state } = useLocation();
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [notice, setNotice] = useState(state?.message || '');
  const [confirmation, setConfirmation] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const pending = useRef(false);
  const search = params.get('search') || '';
  const status = params.get('status') || 'active';
  const page = params.get('page') || '1';
  const query = new URLSearchParams({ search, status, page, limit: '12' }).toString();

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setResult(null); setError('');
      request(`/rooms?${query}`, { signal: controller.signal }).then((data) => {
        if (!controller.signal.aborted) setResult(data);
      }).catch((failure) => { if (!controller.signal.aborted) setError(failure.message); });
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [request, query, reload]);

  async function confirmAction() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setActionError('');
    const { room, type } = confirmation;
    const action = actions[type];
    try {
      await request(`/rooms/${room.id}${type === 'restore' ? '/restore' : ''}`, { method: action.method, body: action.body });
      setNotice(`${room.name}: ${type === 'restore' ? 'restored as a draft' : type === 'archive' ? 'archived' : type === 'publish' ? 'published' : 'unpublished'}.`);
      setConfirmation(null); setReload((value) => value + 1);
    } catch (failure) { setActionError(failure.message); }
    finally { setBusy(false); pending.current = false; }
  }

  return (
    <>
      <title>Manage rooms | Manglam Hotel &amp; Restaurant</title>
      <p className="eyebrow">Administration</p><h1>Rooms Management</h1>
      <p className="admin-dashboard-lede">Manage details, prices and publication. Archiving keeps room records safe.</p>
      <div className="admin-room-actions mt-6"><Link to="/admin/rooms/new" className="button button-primary">Add room</Link><Link to="/rooms" className="button button-outline">View public rooms</Link></div>
      {notice && <p role="status" className="admin-room-notice">{notice}</p>}
      <form key={`${search}-${status}`} className="admin-room-filters" onSubmit={(event) => { event.preventDefault(); const values = new FormData(event.currentTarget); setParams({ search: values.get('search').trim(), status: values.get('status'), page: '1' }); }}>
        <div><label htmlFor="room-search">Search rooms by name</label><input id="room-search" name="search" type="search" maxLength={120} defaultValue={search} /></div>
        <div><label htmlFor="room-filter">Show rooms</label><select id="room-filter" name="status" defaultValue={status}><option value="active">Active rooms</option><option value="archived">Archived rooms</option><option value="all">All rooms</option></select></div>
        <button className="button button-outline" type="submit">Apply filters</button>
      </form>
      {error ? <ManagementState error={error} onRetry={() => setReload((value) => value + 1)} /> : !result ? <ManagementState loading /> : <>
        {result.data.length === 0 && <ManagementState>{search ? 'No rooms match your search.' : status === 'archived' ? 'No archived rooms.' : 'No rooms to display. Add a room to create your first draft.'}</ManagementState>}
        <div className="admin-room-list">{result.data.map((room) => <AdminRoomListItem key={room.id} room={room} actions={actions} onAction={(type) => { setActionError(''); setConfirmation({ room, type }); }} />)}</div>
        <div className="admin-room-pagination"><p>{result.pagination.total} rooms · Page {result.pagination.page} of {Math.max(1, result.pagination.totalPages)}</p><div className="admin-room-actions">
          <button type="button" className="button button-outline" disabled={result.pagination.page <= 1} onClick={() => setParams({ search, status, page: String(Number(page) - 1) })}>Previous</button>
          <button type="button" className="button button-outline" disabled={result.pagination.page >= result.pagination.totalPages} onClick={() => setParams({ search, status, page: String(Number(page) + 1) })}>Next</button>
        </div></div>
      </>}
      {confirmation && <ConfirmDialog title={actions[confirmation.type].title} confirmLabel={actions[confirmation.type].label} onCancel={() => setConfirmation(null)} onConfirm={confirmAction} busy={busy} error={actionError}><p><strong>{confirmation.room.name}</strong></p><p>{actions[confirmation.type].message}</p></ConfirmDialog>}
    </>
  );
}
