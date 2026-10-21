/**
 * @param {{
 *   categories: import('../../data/menu.js').MenuCategory[],
 *   activeCategoryId: string | null,
 *   onCategoryChange: (categoryId: string | null) => void
 * }} props
 */
export default function CategoryNavigation({ categories, activeCategoryId, onCategoryChange }) {
  return (
    <nav className="menu-category-navigation" aria-label="Menu categories">
      <ul className="menu-category-list">
        <li>
          <button
            type="button"
            className="menu-category-button"
            aria-pressed={activeCategoryId === null}
            onClick={() => onCategoryChange(null)}
          >
            All Items
          </button>
        </li>
        {categories.map((category) => (
          <li key={category.id}>
            <button
              type="button"
              className="menu-category-button"
              aria-pressed={activeCategoryId === category.id}
              onClick={() => onCategoryChange(category.id)}
            >
              {category.name}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
