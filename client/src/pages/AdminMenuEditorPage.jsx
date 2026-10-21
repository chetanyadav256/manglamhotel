import { Link, useParams } from 'react-router';
import useAdminMenuData from '../hooks/useAdminMenuData.js';
import MenuRecordForm from '../components/admin/MenuRecordForm.jsx';
import ManagementState from '../components/admin/ManagementState.jsx';
import '../styles/admin-rooms.css';
import '../styles/admin-menu.css';

export default function AdminMenuEditorPage({ kind }) {
  const { id } = useParams();
  const item = kind === 'items';
  const record = useAdminMenuData(id ? `/menu/${kind}/${encodeURIComponent(id)}` : null);
  const categories = useAdminMenuData(item ? '/menu/categories?status=all&limit=100' : null, true);
  const listPath = item ? '/admin/restaurant/items' : '/admin/restaurant';
  const error = record.error || categories.error;
  return <>
    <title>{id ? 'Edit' : 'Add'} {item ? 'menu item' : 'category'} | Manglam Hotel &amp; Restaurant</title>
    <p className="eyebrow">Restaurant Management</p><h1>{id ? 'Edit' : 'Add'} {item ? 'menu item' : 'category'}</h1>
    {error ? <ManagementState error={error} onRetry={() => { record.retry(); categories.retry(); }} />
      : (id && !record.result) || (item && !categories.result) ? <ManagementState>Loading menu details…</ManagementState>
        : record.result?.data.isArchived ? <ManagementState>This record is archived. Restore it from the list before editing.</ManagementState>
          : <MenuRecordForm key={`${kind}-${id || 'new'}`} kind={kind} record={id ? record.result.data : undefined} categories={categories.result?.data} />}
    {(error || record.result?.data.isArchived) && <Link className="button button-outline mt-6" to={listPath}>Back to management</Link>}
  </>;
}
