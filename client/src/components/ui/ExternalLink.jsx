import { ArrowUpRight } from 'lucide-react';

export default function ExternalLink({ href, children, className = 'button button-primary', ...props }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className} {...props}>
      {children}
      <ArrowUpRight size={17} aria-hidden="true" className="shrink-0" />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
