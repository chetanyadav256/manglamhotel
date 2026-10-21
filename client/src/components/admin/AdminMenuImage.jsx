import { useEffect, useRef, useState } from 'react';
import { useAdminAuth } from '../../app/useAdminAuth.js';
import { MenuPhoto } from './MenuRecordCard.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';

export default function AdminMenuImage({ item, onStateChange }) {
  const { request } = useAdminAuth();
  const [photo, setPhoto] = useState(null);
  const [alt, setAlt] = useState('');
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [reload, setReload] = useState(0);
  const input = useRef(null);
  const previewUrl = useRef(null);
  const operationId = useRef(globalThis.crypto.randomUUID());
  const inFlight = useRef(null);
  const path = `/menu/items/${item.id}/image`;
  const dirty = Boolean(selected) || Boolean(photo?.image && alt !== photo.image.alt);
  useEffect(() => { onStateChange({ dirty, busy }); }, [dirty, busy, onStateChange]);
  useEffect(() => {
    const controller = new AbortController();
    request(path, { signal: controller.signal }).then(({ data }) => {
      if (!controller.signal.aborted) { setPhoto(data); setAlt(data.image?.alt || ''); setError(''); }
    }).catch((failure) => { if (!controller.signal.aborted) setError(failure.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [request, path, reload]);
  useEffect(() => () => { if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); inFlight.current?.abort(); }, []);
  function clearSelection() {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null; setSelected(null);
    if (input.current) input.current.value = '';
    operationId.current = globalThis.crypto.randomUUID();
  }
  function select(event) {
    const files = Array.from(event.target.files || []);
    clearSelection(); setError(''); setNotice('');
    if (!files.length) return;
    const file = files[0];
    if (files.length !== 1 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || !file.size || file.size > 5 * 1024 * 1024) {
      setError('Select one non-empty JPEG, PNG or WebP photo, no larger than 5 MB.'); return;
    }
    const preview = URL.createObjectURL(file); previewUrl.current = preview; setSelected({ file, preview });
  }
  async function mutate(method) {
    if (inFlight.current || !photo) return;
    const controller = new AbortController(); inFlight.current = controller;
    setBusy(true); setError(''); setNotice('');
    try {
      let body = { version: photo.version, operationId: operationId.current, ...(method === 'PATCH' ? { alt } : {}) };
      if (method === 'POST' || method === 'PUT') {
        if (!selected) return;
        body = new FormData(); body.append('image', selected.file);
        body.append('alt', alt); body.append('version', String(photo.version)); body.append('operationId', operationId.current);
      }
      const { data } = await request(path, { method, body, signal: controller.signal });
      setPhoto(data); setAlt(data.image?.alt || ''); clearSelection(); setConfirming(false);
      setNotice(`${method === 'DELETE' ? 'Photo removed.' : method === 'PATCH' ? 'Alternative text saved.' : 'Photo saved.'}${data.cleanupPending ? ' Media cleanup is queued for retry.' : ''}${data.legacyAssetRetained ? ' The previous unmanaged asset was retained.' : ''}`);
    } catch (failure) { if (!controller.signal.aborted) setError(failure.message); }
    finally { inFlight.current = null; setBusy(false); }
  }
  const disabled = loading || busy || !photo || item.isArchived;
  return <section className="admin-room-form admin-menu-form admin-menu-image" aria-labelledby={`photo-title-${item.id}`}>
    <h2 id={`photo-title-${item.id}`}>Food photo</h2>
    <p className="admin-field-hint">One optional photo per dish. JPEG, PNG or WebP; up to 5 MB and 40 megapixels. Dish details are saved separately.</p>
    {loading ? <p role="status">Loading photo…</p> : <MenuPhoto key={photo?.image?.url || 'empty'} image={photo?.image ? { src: photo.image.url, alt: photo.image.alt } : null} name={item.name} />}
    {photo?.image && !photo.image.managed && <p className="admin-field-hint">Legacy photo: replacement or removal changes this dish only. Its unmanaged remote asset is retained.</p>}
    <fieldset disabled={disabled}>
      <legend className="sr-only">Food photo controls</legend>
      <label htmlFor={`select-photo-${item.id}`}>{photo?.image ? 'Select replacement photo' : 'Select food photo'}</label>
      <input ref={input} id={`select-photo-${item.id}`} type="file" accept="image/jpeg,image/png,image/webp" onChange={select} />
      {selected && <div className="admin-menu-image-selection"><img src={selected.preview} alt="Selected photo preview" /><p>{selected.file.name}</p></div>}
      <label htmlFor={`photo-alt-${item.id}`}>Photo alternative text (optional)</label>
      <input id={`photo-alt-${item.id}`} maxLength={300} value={alt} onChange={(event) => { setAlt(event.target.value); operationId.current = globalThis.crypto.randomUUID(); }} />
      <div className="admin-room-actions mt-6">
        {selected && <button className="button button-primary" type="button" onClick={() => mutate(photo.image ? 'PUT' : 'POST')}>{busy ? 'Uploading photo…' : photo?.image ? 'Replace photo' : 'Upload photo'}</button>}
        {photo?.image && !selected && <button className="button button-primary" type="button" disabled={alt === photo.image.alt} onClick={() => mutate('PATCH')}>Save alternative text</button>}
        {dirty && <button className="button button-outline" type="button" onClick={() => { clearSelection(); setAlt(photo.image?.alt || ''); }}>Cancel photo changes</button>}
        {photo?.image && <button className="button button-outline" type="button" onClick={() => { setError(''); operationId.current = globalThis.crypto.randomUUID(); setConfirming(true); }}>Remove photo</button>}
      </div>
    </fieldset>
    {busy && <p className="admin-field-hint" role="status">Saving photo changes…</p>}
    {error && !confirming && <p className="admin-form-error" role="alert">{error}</p>}
    {!busy && <button className="button button-outline mt-4" type="button" onClick={() => { clearSelection(); setPhoto(null); setLoading(true); setReload((value) => value + 1); }}>Reload photo</button>}
    {notice && <p className="admin-image-success" role="status">{notice}</p>}
    {confirming && <ConfirmDialog title="Remove this food photo?" confirmLabel="Remove photo" busy={busy} error={error} onCancel={() => setConfirming(false)} onConfirm={() => mutate('DELETE')}><p>The photo will be removed from this dish. Its managed ImageKit asset will be deleted after the database change succeeds.</p></ConfirmDialog>}
  </section>;
}
