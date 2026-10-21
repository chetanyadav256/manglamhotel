import { Link } from 'react-router';
import { useSiteSettings } from '../../app/SiteSettingsContext.js';

export default function Brand({ light = false }) {
  const { hotelName } = useSiteSettings();
  const [brandName, ...descriptor] = hotelName.split(/\s+/);
  return (
    <Link to="/" aria-label={`${hotelName} home`} className={`brand ${light ? 'brand-light' : ''}`}>
      <span className="brand-name">{brandName.toUpperCase()}<span aria-hidden="true" className="brand-dot">.</span></span>
      <span className="brand-caption">{(descriptor.join(' ') || 'Hotel & Restaurant').toUpperCase()}</span>
    </Link>
  );
}
