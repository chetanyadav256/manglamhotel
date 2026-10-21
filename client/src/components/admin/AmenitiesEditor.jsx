import { useState } from 'react';

export default function AmenitiesEditor({ amenities, onChange }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  function add() {
    const item = value.trim();
    if (!item || item.length > 120) return setError('Enter an amenity of 1 to 120 characters.');
    if (amenities.some((entry) => entry.toLowerCase() === item.toLowerCase())) return setError('This amenity has already been added.');
    if (amenities.length >= 50) return setError('You can add up to 50 amenities.');
    onChange([...amenities, item]); setValue(''); setError('');
  }
  return (
    <div className="admin-amenities-editor">
      <label htmlFor="amenity-input">Amenities</label>
      <p id="amenities-help" className="admin-field-hint">Add only confirmed amenities. Up to 50, each at most 120 characters. Use Add amenity to include an entry.</p>
      <div className="admin-amenity-input">
        <input id="amenity-input" value={value} maxLength={120} aria-describedby="amenities-help" onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); add(); } }} />
        <button type="button" className="button button-outline" onClick={add}>Add amenity</button>
      </div>
      {error && <p role="alert" className="admin-form-error">{error}</p>}
      <ul className="admin-amenity-list">{amenities.map((item, index) => <li key={`${item}-${index}`}><span>{item}</span><button type="button" aria-label={`Remove ${item}`} onClick={() => onChange(amenities.filter((_, position) => position !== index))}>Remove</button></li>)}</ul>
    </div>
  );
}
