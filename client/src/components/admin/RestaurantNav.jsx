import { NavLink } from 'react-router';

export default function RestaurantNav() {
  return <nav className="admin-menu-nav" aria-label="Restaurant sections">
    <NavLink to="/admin/restaurant" end>Food Categories</NavLink>
    <NavLink to="/admin/restaurant/items">Menu Items</NavLink>
  </nav>;
}
