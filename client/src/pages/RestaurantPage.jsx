import { useCallback } from 'react';
import MenuListing from '../components/restaurant/MenuListing.jsx';
import useApiData from '../hooks/useApiData.js';
import { getMenuCategories, getMenuItems } from '../services/api.js';
import '../styles/restaurant.css';

export default function RestaurantPage() {
  const loadMenu = useCallback(async ({ signal }) => {
    const [categories, items] = await Promise.all([
      getMenuCategories({ signal }),
      getMenuItems({ signal }),
    ]);
    return { categories, items };
  }, []);
  const { data: menu, error, loading, retry } = useApiData(loadMenu);

  return (
    <>
      <section className="restaurant-hero" aria-labelledby="restaurant-heading">
        <p className="eyebrow">Restaurant</p>
        <h1 id="restaurant-heading">Manglam Restaurant</h1>
        <p className="restaurant-hero-subtitle">Explore Our Menu</p>
        <span className="gold-rule" aria-hidden="true" />
      </section>
      {loading ? (
        <p className="restaurant-request-state" role="status">Loading menu information…</p>
      ) : error ? (
        <div className="restaurant-request-state restaurant-request-error" role="alert">
          <h2>Menu information is temporarily unavailable.</h2>
          <p>Please try again, or contact Manglam Hotel &amp; Restaurant for menu details.</p>
          <button type="button" className="button button-primary" onClick={retry}>Try again</button>
        </div>
      ) : (
        <MenuListing categories={menu.categories} items={menu.items} />
      )}
    </>
  );
}
