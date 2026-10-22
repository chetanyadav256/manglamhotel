import { menuCategoryIds } from '../../../shared/menu.js';
import { useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { useAdminAuth } from '../app/useAdminAuth.js';
import useAdminMenuData from '../hooks/useAdminMenuData.js';
import ConfirmDialog from '../components/admin/ConfirmDialog.jsx';
import ManagementState from '../components/admin/ManagementState.jsx';
import MenuRecordCard from '../components/admin/MenuRecordCard.jsx';
import RestaurantNav from '../components/admin/RestaurantNav.jsx';
import '../styles/admin-rooms.css';
import '../styles/admin-menu.css';

const actionDefinitions = {
  publish: { verb: 'Publish', method: 'PATCH', body: { isPublished: true }, message: 'Make these details public. Menu items appear only while at least one assigned category is published and active.' },
  unpublish: { verb: 'Unpublish', method: 'PATCH', body: { isPublished: false }, message: 'Hide this record from the public menu. Dishes remain visible in their other published categories.' },
  delete: { verb: 'Delete', method: 'DELETE', body: { confirmPermanentDelete: true }, message: 'Deletion is permanent and cannot be undone. A category can only be deleted after its dishes have been reassigned or deleted. Deleting a dish also schedules its managed photo for permanent deletion.' },
  restore: { verb: 'Restore', method: 'POST', body: {}, message: 'Restore as an unpublished draft. For dishes, restore or update their assigned categories first. Publication requires a separate action.' },
  available: { verb: 'Mark available', method: 'PATCH', body: { isAvailable: true }, message: 'Update availability without changing publication. This website does not accept orders.' },
  unavailable: { verb: 'Mark unavailable', method: 'PATCH', body: { isAvailable: false }, message: 'Published dishes stay visible with a Currently unavailable label.' },
};

export default function AdminRestaurantPage({ kind = 'categories' }) {
  const item = kind === 'items';
  const noun = item ? 'item' : 'category';
  const { request } = useAdminAuth();
  const { state } = useLocation();
  const [params, setParams] = useSearchParams();
  const search = params.get('search') || '';
  const status = params.get('status') || 'active';
  const publication = params.get('publication') || 'all';
  const availability = params.get('availability') || 'all';
  const category = params.get('category') || '';
  const page = params.get('page') || '1';
  const filters = { search, status, publication, ...(item ? { availability, ...(category ? { category } : {}) } : {}) };
  const query = new URLSearchParams({ ...filters, page, limit: '12' });
  const list = useAdminMenuData(`/menu/${kind}?${query}`);
  const categories = useAdminMenuData(item ? '/menu/categories?status=all&limit=100' : null, true);
  const [notice, setNotice] = useState(state?.message || '');
  const [cleanupWarning, setCleanupWarning] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const pending = useRef(false);
  const action = confirmation && actionDefinitions[confirmation.type];
  const actionLabel = action && `${action.verb}${['available', 'unavailable'].includes(confirmation.type) ? '' : ` ${noun}`}`;
  async function confirm() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setActionError('');
    try {
      const response = await request(`/menu/${kind}/${confirmation.record.id}${confirmation.type === 'restore' ? '/restore' : ''}`, { method: action.method, body: action.body });
      setNotice(response?.data?.message || `${confirmation.record.name}: ${actionLabel.toLowerCase()} completed.`);
      setCleanupWarning(response?.data?.cleanupPending ? response.data.message : '');
      setConfirmation(null); list.retry();
    } catch (failure) { setActionError(failure.message); }
    finally { pending.current = false; setBusy(false); }
  }
  const result = list.result;
  return <>
    <p className="eyebrow">Administration</p><h1>Restaurant Management</h1>
    <p className="admin-dashboard-lede">Manage verified menu details. Publication and dish availability are separate controls.</p>
    <RestaurantNav />
    <h2 className="admin-menu-section-title">{item ? 'Menu Items' : 'Food Categories'}</h2>
    <div className="admin-room-actions mt-6"><Link className="button button-primary" to={`/admin/restaurant/${kind}/new`}>Add {noun}</Link><Link className="button button-outline" to="/restaurant">View public menu</Link></div>
    {notice && <p className="admin-room-notice" role="status">{notice}</p>}
    {cleanupWarning && <p className="admin-menu-cleanup-warning" role="alert">{cleanupWarning}</p>}
    {categories.error && <ManagementState error={categories.error} onRetry={categories.retry} />}
    <form key={query.toString()} className="admin-room-filters" onSubmit={(event) => {
      event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget));
      if (!values.category) delete values.category;
      setParams({ ...values, search: values.search.trim(), page: '1' });
    }}>
      <div><label htmlFor="menu-search">Search {item ? 'items' : 'categories'}</label><input id="menu-search" name="search" type="search" maxLength={150} defaultValue={search} /></div>
      <div><label htmlFor="menu-status">Record status</label><select id="menu-status" name="status" defaultValue={status}><option value="active">Active records</option><option value="archived">Previously archived</option><option value="all">All records</option></select></div>
      <div><label htmlFor="menu-publication">Publication</label><select id="menu-publication" name="publication" defaultValue={publication}><option value="all">All publication states</option><option value="draft">Unpublished</option><option value="published">Published</option></select></div>
      {item && <>
        <div><label htmlFor="menu-category-filter">Filter by category</label><select key={categories.result ? 'ready' : 'loading'} id="menu-category-filter" name="category" defaultValue={category} disabled={!categories.result}><option value="">All categories</option>{categories.result?.data.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}{entry.isArchived ? ' (archived)' : ''}</option>)}</select></div>
        <div><label htmlFor="menu-availability">Availability</label><select id="menu-availability" name="availability" defaultValue={availability}><option value="all">All availability states</option><option value="available">Available</option><option value="unavailable">Unavailable</option></select></div>
      </>}
      <button className="button button-outline" type="submit">Apply filters</button>
    </form>
    {list.error ? <ManagementState error={list.error} onRetry={list.retry} /> : !result ? <ManagementState>Loading menu records…</ManagementState> : <>
      {!result.data.length && <ManagementState>No {item ? 'menu items' : 'categories'} match these filters. Add a record or adjust your filters.</ManagementState>}
      <div className="admin-room-list">{result.data.map((record) => <MenuRecordCard key={record.id} record={record} kind={kind} categories={categories.result?.data.filter((entry) => menuCategoryIds(record).includes(entry.id))} onAction={(type) => { setActionError(''); setConfirmation({ record, type }); }} />)}</div>
      <div className="admin-room-pagination"><p>{result.pagination.total} records · Page {result.pagination.page} of {Math.max(1, result.pagination.totalPages)}</p><div className="admin-room-actions">
        <button className="button button-outline" disabled={result.pagination.page <= 1} onClick={() => setParams({ ...filters, page: String(Number(page) - 1) })}>Previous</button>
        <button className="button button-outline" disabled={result.pagination.page >= result.pagination.totalPages} onClick={() => setParams({ ...filters, page: String(Number(page) + 1) })}>Next</button>
      </div></div>
    </>}
    {confirmation && <ConfirmDialog title={`${actionLabel}?`} confirmLabel={actionLabel} busy={busy} error={actionError} onCancel={() => setConfirmation(null)} onConfirm={confirm}><p><strong>{confirmation.record.name}</strong></p><p>{action.message}</p></ConfirmDialog>}
  </>;
}
