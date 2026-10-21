/**
 * Frontend menu contract for a future API adapter.
 *
 * @typedef {Object} MenuCategory
 * @property {string} id Stable identifier referenced by menu items.
 * @property {string} name Owner-approved category name.
 * @property {number} [sortOrder] Optional position in the menu.
 * @property {boolean} isPublished Whether the category is visible to customers.
 *
 * @typedef {Object} MenuItem
 * @property {string} id Stable identifier supplied by the content source.
 * @property {string} categoryId Reference to a published MenuCategory.
 * @property {string} name Owner-approved dish name.
 * @property {string} [description] Optional plain-text description.
 * @property {number} [priceInRupees] Price in INR major units, not paise.
 * @property {{src: string, alt?: string, srcSet?: string}} [image] Approved food photo with optional responsive CDN variants.
 * @property {boolean} [isVegetarian] Show an indicator only when verified true.
 * @property {boolean} [isAvailable] Optional availability status from the content source.
 * @property {boolean} isPublished Unpublished items are never shown to customers.
 */

/** @type {MenuCategory[]} */
export const menuCategories = [];

/** @type {MenuItem[]} */
export const menuItems = [];
