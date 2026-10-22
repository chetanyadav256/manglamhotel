import { normalizeMenuText } from '../../../../shared/menu.js';
import { useState } from 'react';
import { UtensilsCrossed } from 'lucide-react';
import { menuCategories as defaultCategories, menuItems as defaultItems } from '../../data/menu.js';
import ActionLink from '../ui/ActionLink.jsx';
import CategoryNavigation from './CategoryNavigation.jsx';
import MenuItemCard from './MenuItemCard.jsx';

function sortCategories(categories) {
  return categories
    .map((category, index) => ({ category, index }))
    .filter(({ category }) => category.isPublished === true && !category.isArchived)
    .sort((first, second) => (
      (first.category.sortOrder ?? first.index) - (second.category.sortOrder ?? second.index)
    ))
    .map(({ category }) => category);
}

/**
 * @param {{
 *   categories?: import('../../data/menu.js').MenuCategory[],
 *   items?: import('../../data/menu.js').MenuItem[]
 * }} props
 */
export default function MenuListing({ categories = defaultCategories, items = defaultItems }) {
  const [search, setSearch] = useState('');
  const normalizedSearch = normalizeMenuText(search);
  const categoryIds = (item) => item.categoryIds ?? (item.categoryId ? [item.categoryId] : []);
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const publishedCategories = sortCategories(categories);
  const publishedCategoryIds = new Set(publishedCategories.map((category) => category.id));
  const publishedItems = [...new Map(items.map((item) => [item.id, item])).values()].filter((item) => (
    item.isPublished === true && !item.isArchived && categoryIds(item).some((id) => publishedCategoryIds.has(id))
  ));
  const activeCategoryId = publishedCategories.some((category) => category.id === selectedCategoryId)
    ? selectedCategoryId
    : null;
  const visibleCategories = activeCategoryId === null
    ? publishedCategories
    : publishedCategories.filter((category) => category.id === activeCategoryId);

  const searchItems = publishedItems.filter((item) =>
    (activeCategoryId === null || categoryIds(item).includes(activeCategoryId))
    && [item.name, ...(item.tags || [])].some((value) => normalizeMenuText(value).includes(normalizedSearch)));

  return (
    <section className="restaurant-menu" aria-labelledby="restaurant-menu-heading">
      <div className="restaurant-menu-intro">
        <div>
          <p className="eyebrow">Manglam Hotel &amp; Restaurant</p>
          <h2 id="restaurant-menu-heading" className="display-heading">The Menu</h2>
        </div>
      </div>

      {publishedItems.length === 0 ? (
        <div className="restaurant-empty-state">
          <span className="restaurant-empty-icon" aria-hidden="true">
            <UtensilsCrossed size={30} strokeWidth={1.2} />
          </span>
          <h3>Our menu will be available here soon.</h3>
          <p>
            For menu details, please contact Manglam Hotel &amp; Restaurant.
          </p>
          <ActionLink to="/contact">Contact Restaurant</ActionLink>
        </div>
      ) : (
        <>
          <div className="menu-search">
            <label htmlFor="public-menu-search">Search dishes or tags</label>
            <div><input id="public-menu-search" type="search" placeholder="Search dishes or tags..." maxLength={150} value={search} onChange={(event) => setSearch(event.target.value)} />
              <button className="button button-outline" type="button" disabled={!search} onClick={() => { setSearch(''); document.getElementById('public-menu-search').focus(); }}>Clear search</button></div>
          </div>
          <CategoryNavigation
            categories={publishedCategories}
            activeCategoryId={activeCategoryId}
            onCategoryChange={setSelectedCategoryId}
          />
          <div className="menu-category-sections" aria-live="polite">
            {normalizedSearch || activeCategoryId === null ? <>
              <p role="status">{searchItems.length ? `${searchItems.length} ${searchItems.length === 1 ? 'dish' : 'dishes'} found.` : 'No dishes match your search. Try another dish name or tag, or choose a different category.'}</p>
              <div className="menu-item-grid">{searchItems.map((item) => <MenuItemCard key={item.id} item={item} />)}</div>
            </> : visibleCategories.map((category) => {
              const categoryItems = publishedItems.filter((item) => categoryIds(item).includes(category.id));

              return (
                <section
                  key={category.id}
                  className="menu-category-section"
                  aria-labelledby={`menu-category-${category.id}`}
                >
                  <div className="menu-category-heading">
                    <span className="gold-rule" aria-hidden="true" />
                    <h3 id={`menu-category-${category.id}`}>{category.name}</h3>
                  </div>
                  {categoryItems.length > 0 ? (
                    <div className="menu-item-grid">
                      {categoryItems.map((item) => <MenuItemCard key={item.id} item={item} />)}
                    </div>
                  ) : (
                    <p className="menu-category-empty" role="status">
                      No published items in this category yet.
                    </p>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
