import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router';

export default function ActionLink({ to, children, variant = 'primary', className = '' }) {
  return <Link to={to} className={`button button-${variant} ${className}`}>{children}<ArrowUpRight size={17} aria-hidden="true" className="shrink-0" /></Link>;
}
