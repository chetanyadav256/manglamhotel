export default function MenuCategoriesEditor({ categories, selected, onChange, error }) {
  const known = new Set(categories.map(({ id }) => id));
  const choices = [...categories, ...selected.filter((id) => !known.has(id)).map((id) => ({ id, name: 'Category no longer exists', isArchived: true }))];
  return <fieldset className="menu-category-editor" id="menu-categories" tabIndex={-1} aria-describedby={error ? 'menu-categories-error' : 'menu-categories-hint'}>
    <legend>Categories (required)</legend>
    <p id="menu-categories-hint" className="admin-field-hint">Select at least one active category, up to 50. A published dish appears in each of its published categories.</p>
    {choices.map((category) => <label className="admin-menu-checkbox" key={category.id}>
      <input type="checkbox" checked={selected.includes(category.id)} disabled={category.isArchived && !selected.includes(category.id)}
        onChange={(event) => onChange(event.target.checked ? [...selected, category.id] : selected.filter((id) => id !== category.id))} />
      <span>{category.name}{category.isArchived ? ' (archived — deselect to save)' : !category.isPublished ? ' (draft)' : ''}</span>
    </label>)}
    <p className="admin-field-hint">Selected: {choices.filter(({ id }) => selected.includes(id)).map(({ name }) => name).join(', ') || 'None'}</p>
    {error && <p className="admin-form-error" id="menu-categories-error" role="alert">{error}</p>}
  </fieldset>;
}
