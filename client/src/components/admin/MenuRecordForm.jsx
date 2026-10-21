import { useRef, useState } from 'react';
import { Link, useBeforeUnload, useBlocker, useNavigate } from 'react-router';
import { useAdminAuth } from '../../app/useAdminAuth.js';
import ConfirmDialog from './ConfirmDialog.jsx';
import { MenuStatus } from './MenuRecordCard.jsx';
import AdminMenuImage from './AdminMenuImage.jsx';

export default function MenuRecordForm({ record, kind, categories = [] }) {
  const item = kind === 'items';
  const { request } = useAdminAuth();
  const navigate = useNavigate();
  const listPath = item ? '/admin/restaurant/items' : '/admin/restaurant';
  const initial = {
    name: record?.name || '', description: record?.description || '', displayOrder: String(record?.displayOrder ?? 0),
    category: record?.category || '', price: record?.price == null ? '' : String(record.price),
    vegetarian: record?.vegetarian == null ? '' : String(record.vegetarian), isAvailable: record?.isAvailable !== false,
  };
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [photoState, setPhotoState] = useState({ dirty: false, busy: false });
  const pending = useRef(false);
  const saved = useRef(false);
  const dirty = JSON.stringify(initial) !== JSON.stringify(values) || photoState.dirty || photoState.busy;
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !saved.current && currentLocation.pathname !== nextLocation.pathname);
  useBeforeUnload((event) => { if (dirty && !saved.current) { event.preventDefault(); event.returnValue = ''; } });
  const change = (key, value) => setValues((previous) => ({ ...previous, [key]: value }));
  const field = (key) => ({ id: `menu-${key}`, value: values[key], onChange: (event) => change(key, event.target.value), 'aria-invalid': Boolean(errors[key]), 'aria-describedby': errors[key] ? `menu-${key}-error` : undefined });
  const fieldError = (key) => errors[key] && <p className="admin-form-error" id={`menu-${key}-error`} role="alert">{errors[key]}</p>;
  const maxName = item ? 150 : 100;
  const maxDescription = item ? 3000 : 1000;
  async function submit(event) {
    event.preventDefault(); if (pending.current) return;
    if (photoState.busy || photoState.dirty) { setError('Save or cancel photo changes before saving dish details.'); return; }
    const invalid = {};
    if (!values.name.trim() || values.name.trim().length > maxName) invalid.name = `Enter a name of 1 to ${maxName} characters.`;
    if (values.description.trim().length > maxDescription) invalid.description = `Use at most ${maxDescription} characters.`;
    if (!/^\d+$/.test(values.displayOrder) || Number(values.displayOrder) > 100000) invalid.displayOrder = 'Enter a whole number from 0 to 100000.';
    if (item) {
      if (!categories.some((entry) => entry.id === values.category && !entry.isArchived)) invalid.category = 'Select an active category. Restore an archived category first if needed.';
      if (values.price !== '' && (!/^\d+(\.\d{1,2})?$/.test(values.price) || Number(values.price) > 10000000)) invalid.price = 'Enter a non-negative INR amount up to 10000000 with at most two decimal places, or leave blank.';
    }
    setErrors(invalid); setError('');
    if (Object.keys(invalid).length) { document.getElementById(`menu-${Object.keys(invalid)[0]}`)?.focus(); return; }
    pending.current = true; setSaving(true);
    try {
      await request(`/menu/${kind}${record ? `/${record.id}` : ''}`, {
        method: record ? 'PATCH' : 'POST',
        body: {
          name: values.name.trim(), description: values.description.trim(), displayOrder: Number(values.displayOrder),
          ...(item ? { category: values.category, price: values.price === '' ? null : Number(values.price), vegetarian: values.vegetarian === '' ? null : values.vegetarian === 'true', isAvailable: values.isAvailable } : {}),
        },
      });
      saved.current = true;
      navigate(listPath, { state: { message: record ? 'Changes saved.' : 'Draft created. Review the details before publishing.' } });
    } catch (failure) { setError(failure.message); }
    finally { pending.current = false; setSaving(false); }
  }
  return <>
    <form className="admin-room-form admin-menu-form" onSubmit={submit} noValidate>
      <fieldset disabled={saving}>
        <legend className="sr-only">{item ? 'Menu item' : 'Category'} details</legend>
        <MenuStatus record={record || {}} />
        <p className="admin-field-hint">New records are drafts. Publication is managed separately from the list.</p>
        <label htmlFor="menu-name">{item ? 'Dish name' : 'Category name'} (required)</label><input {...field('name')} required maxLength={maxName} autoComplete="off" />{fieldError('name')}
        {!item && <p className="admin-field-hint">{record ? `Slug: ${record.slug}. Renaming keeps the existing slug.` : 'A unique slug is generated automatically. Category names must be unique, including archived categories.'}</p>}
        <label htmlFor="menu-description">Description (optional)</label><textarea {...field('description')} rows={5} maxLength={maxDescription} />{fieldError('description')}
        {item && <>
          {!categories.some((entry) => !entry.isArchived) && <p className="admin-field-hint">No active categories. <Link className="contact-link" to="/admin/restaurant">Add or restore a category</Link> before saving a dish.</p>}
          <label htmlFor="menu-category">Category (required)</label><select {...field('category')} required><option value="">Select a category</option>
            {record?.category && !categories.some((entry) => entry.id === record.category) && <option value={record.category} disabled>Category no longer exists — choose another</option>}
            {categories.map((entry) => <option key={entry.id} value={entry.id} disabled={entry.isArchived}>{entry.name}{entry.isArchived ? ' (archived)' : !entry.isPublished ? ' (draft)' : ''}</option>)}
          </select>{fieldError('category')}
          <p className="admin-field-hint">Both the category and the dish must be published to appear publicly.</p>
          <div className="admin-form-columns">
            <div><label htmlFor="menu-price">Price (INR, optional)</label><input {...field('price')} inputMode="decimal" maxLength={16} />{fieldError('price')}<p className="admin-field-hint">Leave blank to clear the price. Customers see Price on request.</p></div>
            <div><label htmlFor="menu-vegetarian">Vegetarian indicator</label><select {...field('vegetarian')}><option value="">Unspecified</option><option value="true">Vegetarian</option><option value="false">Non-vegetarian</option></select></div>
          </div>
          <label className="admin-menu-checkbox"><input type="checkbox" checked={values.isAvailable} onChange={(event) => change('isAvailable', event.target.checked)} />Available</label>
          <p className="admin-field-hint">Unavailable published dishes remain visible with a Currently unavailable label. There is no online ordering.</p>
        </>}
        <label htmlFor="menu-displayOrder">Display order</label><input {...field('displayOrder')} inputMode="numeric" maxLength={6} />{fieldError('displayOrder')}
        <p className="admin-field-hint">0–100000. Lower numbers appear first.</p>
        {item && !record && <p className="admin-field-hint">Save this dish first, then choose Edit item to upload its optional food photo.</p>}
        {error && <p className="admin-form-error mt-6" role="alert">{error}</p>}
        <div className="admin-room-actions mt-6"><button className="button button-primary" type="submit">{saving ? 'Saving…' : record ? 'Save changes' : 'Create draft'}</button><button className="button button-outline" type="button" onClick={() => navigate(listPath)}>Cancel</button></div>
      </fieldset>
    </form>
    {item && record && <AdminMenuImage item={record} onStateChange={setPhotoState} />}
    {blocker.state === 'blocked' && <ConfirmDialog title="Discard unsaved changes?" confirmLabel="Discard changes" onCancel={() => blocker.reset()} onConfirm={() => blocker.proceed()}><p>Your unsaved changes will be lost.</p></ConfirmDialog>}
  </>;
}
