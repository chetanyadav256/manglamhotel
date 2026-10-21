import { useRef, useState } from 'react';
import { useBeforeUnload, useBlocker, useNavigate } from 'react-router';
import { useAdminAuth } from '../../app/useAdminAuth.js';
import AmenitiesEditor from './AmenitiesEditor.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import RoomStatus from './RoomStatus.jsx';
import AdminRoomImages from './AdminRoomImages.jsx';

export default function AdminRoomForm({ room }) {
  const { request } = useAdminAuth();
  const navigate = useNavigate();
  const initial = { name: room?.name || '', description: room?.description || '', price: room?.pricePerNight == null ? '' : String(room.pricePerNight), displayOrder: String(room?.displayOrder ?? 0), amenities: room?.amenities || [] };
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submitted = useRef(false);
  const saved = useRef(false);
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !saved.current && currentLocation.pathname !== nextLocation.pathname);
  useBeforeUnload((event) => { if (dirty && !saved.current) { event.preventDefault(); event.returnValue = ''; } });
  const update = (field, value) => setValues((previous) => ({ ...previous, [field]: value }));

  async function submit(event) {
    event.preventDefault();
    if (submitted.current) return;
    const invalid = {};
    if (!values.name.trim() || values.name.trim().length > 120) invalid.name = 'Enter a room name of 1 to 120 characters.';
    if (values.description.trim().length > 3000) invalid.description = 'Use at most 3000 characters.';
    if (values.price !== '' && (!/^\d+(\.\d{1,2})?$/.test(values.price) || !Number.isFinite(Number(values.price)) || Number(values.price) > 10000000)) invalid.price = 'Enter a non-negative INR amount up to 10000000 with at most two decimal places, or leave blank.';
    if (!/^\d+$/.test(values.displayOrder) || Number(values.displayOrder) > 100000) invalid.displayOrder = 'Enter a whole number from 0 to 100000.';
    setErrors(invalid); setError('');
    if (Object.keys(invalid).length) {
      document.getElementById(`room-${Object.keys(invalid)[0]}`)?.focus();
      return;
    }
    submitted.current = true; setSaving(true);
    try {
      await request(room ? `/rooms/${room.id}` : '/rooms', {
        method: room ? 'PATCH' : 'POST',
        body: { name: values.name.trim(), description: values.description.trim(), pricePerNight: values.price === '' ? null : Number(values.price), displayOrder: Number(values.displayOrder), amenities: values.amenities },
      });
      saved.current = true;
      navigate('/admin/rooms', { state: { message: room ? 'Room changes saved.' : 'Room created as a draft. Publish it when ready.' } });
    } catch (failure) { setError(failure.message); }
    finally { submitted.current = false; setSaving(false); }
  }

  const field = (name) => ({ id: `room-${name}`, value: values[name], onChange: (event) => update(name, event.target.value), 'aria-invalid': Boolean(errors[name]), 'aria-describedby': errors[name] ? `room-${name}-error` : undefined });
  const fieldError = (name) => errors[name] && <p className="admin-form-error" role="alert" id={`room-${name}-error`}>{errors[name]}</p>;
  return (
    <>
      <form className="admin-room-form" onSubmit={submit} noValidate>
        <fieldset disabled={saving}>
          <legend className="sr-only">Room details</legend>
          <RoomStatus room={room || {}} />
          <p className="admin-field-hint">{room ? 'Publication is managed separately from the room list.' : 'New rooms are saved as unpublished drafts. Publish separately after reviewing the details.'}</p>
          <label htmlFor="room-name">Room name <span>(required)</span></label>
          <input {...field('name')} required maxLength={120} autoComplete="off" />{fieldError('name')}
          <label htmlFor="room-description">Description</label>
          <textarea {...field('description')} maxLength={3000} rows={6} />{fieldError('description')}
          <p className="admin-field-hint">{values.description.length} / 3000 characters. Use only verified hotel information.</p>
          <div className="admin-form-columns">
            <div><label htmlFor="room-price">Price per night (INR, optional)</label><input {...field('price')} type="text" inputMode="decimal" maxLength={16} />{fieldError('price')}<p className="admin-field-hint">Leave blank to remove the price.</p></div>
            <div><label htmlFor="room-displayOrder">Display order</label><input {...field('displayOrder')} inputMode="numeric" maxLength={6} />{fieldError('displayOrder')}<p className="admin-field-hint">0–100000. Lower numbers appear first.</p></div>
          </div>
          <AmenitiesEditor amenities={values.amenities} onChange={(amenities) => update('amenities', amenities)} />
          {room
            ? <AdminRoomImages room={room} />
            : <div className="admin-room-images"><h2>Room photos</h2><p className="admin-field-hint">Save this room first to upload its photographs.</p></div>}
          {error && <p role="alert" className="admin-form-error">{error} Your entries have been kept; review the message before retrying.</p>}
          <div className="admin-room-actions mt-6"><button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : room ? 'Save changes' : 'Create draft'}</button><button type="button" className="button button-outline" disabled={saving} onClick={() => navigate('/admin/rooms')}>Cancel</button></div>
        </fieldset>
      </form>
      {blocker.state === 'blocked' && <ConfirmDialog title="Discard unsaved changes?" confirmLabel="Discard changes" onCancel={() => blocker.reset()} onConfirm={() => blocker.proceed()} busy={saving}><p>Your unsaved room changes will be lost. Choose Cancel to keep editing.</p></ConfirmDialog>}
    </>
  );
}
