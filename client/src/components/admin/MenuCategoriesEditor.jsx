export default function MenuCategoriesEditor({ categories, selected, onChange, error }) {
  const known = new Set(categories.map(({ id }) => id));
  const choices = [...categories, ...selected.filter((id) => !known.has(id)).map((id) => ({ id, name: 'Category no longer exists', isArchived: true }))];
  return <fieldset className="menu-category-editor" id="menu-categories" tabIndex={-1} aria-describedby={error ? 'menu-categories-error' : 'menu-categories-hint'}>
    <legend>Categories (required)</legend>
    <p id="menu-categories-hint" className="admin-field-hint">Select at least one active category, up to 50. A published dish appears in each of its published categories.</p>
    <div className="menu-category-options">
      {choices.map((category) => {
        const checked = selected.includes(category.id);
        const disabled = category.isArchived && !checked;
        return <label className={`menu-category-option${checked ? ' is-selected' : ''}${disabled ? ' is-disabled' : ''}`} key={category.id}>
          <input type="checkbox" aria-label={category.name} aria-describedby={`menu-category-status-${category.id}`} checked={checked} disabled={disabled}
            onChange={(event) => onChange(event.target.checked ? [...selected, category.id] : selected.filter((id) => id !== category.id))} />
          <span>{category.name}<small id={`menu-category-status-${category.id}`}>{category.isArchived ? checked ? 'Archived - deselect to save' : 'Archived - unavailable' : !category.isPublished ? 'Unpublished' : 'Published'}</small></span>
        </label>;
      })}
    </div>
    <p className="admin-field-hint menu-category-selected">Selected: {choices.filter(({ id }) => selected.includes(id)).map(({ name }) => name).join(', ') || 'None'}</p>
    {error && <p className="admin-form-error" id="menu-categories-error" role="alert">{error}</p>}
  </fieldset>;
}
