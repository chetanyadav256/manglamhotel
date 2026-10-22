export const MAX_MENU_CATEGORIES = 50;
export const MAX_MENU_TAGS = 15;
export const MAX_TAG_LENGTH = 40;
export const MAX_MENU_SEARCH = 150;

export const normalizeMenuText = (value) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();

export function normalizeMenuTags(tags) {
  if (!Array.isArray(tags) || tags.length > MAX_MENU_TAGS) throw new Error('Use at most 15 tags.');
  const normalized = tags.map((tag) => {
    if (typeof tag !== 'string') throw new Error('Each tag must be text.');
    const value = normalizeMenuText(tag);
    if (!value || value.length > MAX_TAG_LENGTH || [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) throw new Error('Each tag must contain 1 to 40 characters.');
    return value;
  });
  return [...new Set(normalized)];
}

// An explicit array is authoritative. Never revive a stale legacy association.
export function menuCategoryIds(item) {
  return [...new Set((Array.isArray(item.categories) ? item.categories : item.category ? [item.category] : []).map(String))];
}
