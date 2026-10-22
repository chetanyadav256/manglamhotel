import { normalizeMenuTags } from '../../../../shared/menu.js';

export default function MenuTagsEditor({ tags, draft, onDraftChange, onChange, error, onError }) {
  function add() {
    try { onChange(normalizeMenuTags([...tags, draft])); onDraftChange(''); onError(''); }
    catch (failure) { onError(failure.message); }
  }
  return <div className="menu-tags-editor">
    <label htmlFor="menu-tags">Search tags (optional)</label>
    <p className="admin-field-hint" id="menu-tags-hint">Up to 15 tags, 40 characters each. Tags are searchable and saved in lowercase. Remove a tag to edit it.</p>
    <div className="admin-room-actions"><input id="menu-tags" value={draft} maxLength={40} aria-describedby="menu-tags-hint menu-tags-error" aria-invalid={Boolean(error)}
      onChange={(event) => onDraftChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); add(); } }} />
      <button className="button button-outline" type="button" onClick={add}>Add tag</button></div>
    <ul className="menu-tag-list">{tags.map((tag) => <li key={tag}><span>{tag}</span><button className="button button-outline" type="button" aria-label={`Remove tag ${tag}`} onClick={() => onChange(tags.filter((value) => value !== tag))}>Remove</button></li>)}</ul>
    <p id="menu-tags-error" className="admin-form-error" role={error ? 'alert' : undefined}>{error}</p>
  </div>;
}
