import { useEffect, useId, useRef } from 'react';

export default function ConfirmDialog({ title, children, confirmLabel, onConfirm, onCancel, busy = false, error = '' }) {
  const dialogRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    dialog.showModal();
    return () => { dialog.close(); previousFocus?.focus(); };
  }, []);
  return (
    <dialog ref={dialogRef} className="admin-confirm-dialog" aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={(event) => { event.preventDefault(); if (!busy) onCancel(); }}>
      <h2 id={titleId}>{title}</h2>
      <div id={descriptionId} className="admin-dialog-description">{children}</div>
      {error && <p role="alert" className="admin-form-error">{error}</p>}
      <div className="admin-room-actions">
        <button type="button" className="button button-outline" autoFocus disabled={busy} onClick={onCancel}>Cancel</button>
        <button type="button" className="button button-primary" disabled={busy} onClick={onConfirm}>{busy ? 'Working…' : confirmLabel}</button>
      </div>
    </dialog>
  );
}
