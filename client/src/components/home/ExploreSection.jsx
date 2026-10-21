import { BedDouble, UtensilsCrossed } from 'lucide-react';
import ActionLink from '../ui/ActionLink.jsx';

const destinations = [
  { number: '01', icon: BedDouble, title: 'Rooms & Availability', description: 'Explore our rooms and get in touch for details, prices and availability.', to: '/rooms', action: 'Explore Rooms', tone: 'rooms' },
  { number: '02', icon: UtensilsCrossed, title: 'Restaurant', description: 'Discover our restaurant. Our food menu will be available to browse here soon.', to: '/restaurant', action: 'View Menu', tone: 'dining' },
];

export default function ExploreSection() {
  return (
    <section id="explore" className="page-container explore-section" aria-labelledby="explore-heading">
      <div className="section-heading-row">
        <div><p className="eyebrow">Your visit, your way</p><h2 id="explore-heading" className="display-heading mt-3">What brings you to Manglam?</h2></div>
        <p className="max-w-xs text-sm leading-6 text-muted">A room enquiry or a look at the menu.<br />Start exploring here.</p>
      </div>
      <div className="explore-grid">
        {destinations.map(({ number, icon: Icon, title, description, to, action, tone }) => (
          <article key={to} className={`destination-card destination-${tone}`}>
            <div className="destination-top"><Icon size={28} strokeWidth={1.3} aria-hidden="true" /><span className="destination-number" aria-hidden="true">{number}</span></div>
            <h3>{title}</h3>
            <p>{description}</p>
            <ActionLink to={to} variant={tone === 'rooms' ? 'light' : 'primary'}>{action}</ActionLink>
            <div className="card-arches" aria-hidden="true" />
          </article>
        ))}
      </div>
    </section>
  );
}
