import { HttpError } from './http.js';
import { MAX_MENU_SEARCH, normalizeMenuText } from '../../../shared/menu.js';

export function menuCategoryFilter(ids) {
  return { $or: [
    { categories: { $in: ids } },
    { categories: { $exists: false }, category: { $in: ids } },
  ] };
}

export function menuSearchFilter(value = '') {
  if (typeof value !== 'string' || value.length > MAX_MENU_SEARCH) throw new HttpError(400, 'Search must be text of at most 150 characters.');
  const search = normalizeMenuText(value);
  if (!search) return {};
  const literal = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = { $regex: literal, $options: 'i' };
  return { $or: [{ name: match }, { tags: match }] };
}
