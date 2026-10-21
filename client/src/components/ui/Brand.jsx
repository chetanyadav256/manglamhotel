import { Link } from 'react-router';

export default function Brand({ light = false }) {
  return (
    <Link to="/" aria-label="Manglam Hotel & Restaurant home" className={`brand ${light ? 'brand-light' : ''}`}>
      <span className="brand-name">MANGLAM<span aria-hidden="true" className="brand-dot">.</span></span>
      <span className="brand-caption">HOTEL & RESTAURANT</span>
    </Link>
  );
}
