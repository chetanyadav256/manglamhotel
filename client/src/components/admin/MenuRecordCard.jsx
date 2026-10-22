import { useState } from 'react';
import { Link } from 'react-router';
import { UtensilsCrossed } from 'lucide-react';

export function MenuStatus({ record }) {
  const status = record.isArchived ? 'archived' : record.isPublished ? 'published' : 'draft';
  return <span className={`admin-room-status status-${status}`}>{status === 'archived' ? 'Archived · Unpublished' : status === 'published' ? 'Published' : 'Draft · Unpublished'}</span>;
}

export function MenuPhoto({ image, name }) {
  const [failed, setFailed] = useState(false);
  return <div className="admin-menu-photo">{image?.src && !failed
    ? <img src={image.src} alt={image.alt || name} loading="lazy" onError={() => setFailed(true)} />
    : <><UtensilsCrossed size={24} aria-hidden="true" /><span>Image not provided</span></>}</div>;
}

const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const date = (value) => value ? new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : 'Not recorded';

export default function MenuRecordCard({ record, kind, categories = [], onAction }) {
  const item = kind === 'items';
  const noun = item ? 'item' : 'category';
  return <article className="admin-room-row admin-menu-record" aria-labelledby={`record-${record.id}`}>
    <div className="admin-room-actions"><MenuStatus record={record} />{item && <span className={`admin-room-status ${record.isAvailable ? 'status-published' : ''}`}>{record.isAvailable ? 'Available' : 'Unavailable'}</span>}</div>
    <div className={item ? 'admin-menu-record-summary' : ''}>
      {item && <MenuPhoto image={record.image} name={record.name} />}
      <div><h2 id={`record-${record.id}`}>{record.name}</h2>
        {item ? <>
          <p className="admin-field-hint">Categories: {categories.map((category) => `${category.name}${category.isArchived ? ' (archived)' : !category.isPublished ? ' (draft)' : ''}`).join(', ') || 'Categories no longer exist'}</p>
          {record.tags?.length > 0 && <p className="admin-field-hint">Tags: {record.tags.join(', ')}</p>}
          <p>{record.price == null ? 'Price on request' : money.format(record.price)}</p>
        </> : <p className="admin-field-hint">Slug: {record.slug}</p>}
        {record.description && <p className="admin-menu-description">{record.description}</p>}
      </div>
    </div>
    <dl className="admin-room-dates"><div><dt>Display order</dt><dd>{record.displayOrder}</dd></div><div><dt>Created (IST)</dt><dd>{date(record.createdAt)}</dd></div><div><dt>Updated (IST)</dt><dd>{date(record.updatedAt)}</dd></div></dl>
    <div className="admin-room-actions">{record.isArchived
      ? <button type="button" className="button button-outline" onClick={() => onAction('restore')}>Restore {noun}</button>
      : <>
        <Link className="button button-outline" to={`/admin/restaurant/${kind}/${record.id}/edit`}>Edit {noun}</Link>
        <button type="button" className="button button-outline" onClick={() => onAction(record.isPublished ? 'unpublish' : 'publish')}>{record.isPublished ? 'Unpublish' : 'Publish'} {noun}</button>
        {item && <button type="button" className="button button-outline" onClick={() => onAction(record.isAvailable ? 'unavailable' : 'available')}>Mark {record.isAvailable ? 'unavailable' : 'available'}</button>}
        <button type="button" className="button button-outline" onClick={() => onAction('archive')}>Archive {noun}</button>
      </>}</div>
  </article>;
}
