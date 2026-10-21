import { useState } from 'react';
import { Leaf, UtensilsCrossed } from 'lucide-react';

const rupeeFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function formatPrice(priceInRupees) {
  if (typeof priceInRupees !== 'number' || !Number.isFinite(priceInRupees) || priceInRupees < 0) {
    return 'Price on request';
  }

  return rupeeFormatter.format(priceInRupees);
}

/**
 * @param {{item: import('../../data/menu.js').MenuItem}} props
 */
export default function MenuItemCard({ item }) {
  const [imageFailed, setImageFailed] = useState(false);
  const image = item.image?.src && !imageFailed ? item.image : null;

  return (
    <article className="menu-item-card" aria-labelledby={`menu-item-${item.id}`}>
      <div className="menu-item-image">
        {image ? (
          <img
            src={image.src}
            srcSet={image.srcSet}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 400px"
            decoding="async"
            alt={image.alt || item.name}
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="menu-item-image-fallback" aria-hidden="true">
            <UtensilsCrossed size={30} strokeWidth={1.2} />
            <span>Image not provided</span>
          </div>
        )}
      </div>
      <div className="menu-item-card-content">
        <div className="menu-item-title-row">
          <h3 id={`menu-item-${item.id}`} className="menu-item-name">{item.name}</h3>
          {item.isVegetarian === true && (
            <span className="menu-item-vegetarian" aria-label="Verified vegetarian">
              <Leaf size={15} aria-hidden="true" />
              <span>Vegetarian</span>
            </span>
          )}
        </div>
        {item.description && <p className="menu-item-description">{item.description}</p>}
        <div className="menu-item-details">
          <p className="menu-item-price">{formatPrice(item.priceInRupees)}</p>
          {item.isAvailable === false && (
            <p className="menu-item-availability">Currently unavailable</p>
          )}
        </div>
      </div>
    </article>
  );
}
