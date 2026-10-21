/**
 * Frontend room contract for a future API adapter.
 *
 * @typedef {Object} Room
 * @property {string} id Stable identifier supplied by the content source.
 * @property {string} name Owner-approved room name.
 * @property {string} [description] Plain text; paragraph breaks are preserved.
 * @property {{src: string, alt?: string}[]} [images] Approved photos with descriptive alt text.
 * @property {string[]} [amenities] Only owner-confirmed amenities.
 * @property {{amount: number, currency: string}} [pricePerNight] Amount in major
 * currency units (not paise/cents), with an ISO 4217 currency code.
 */

// Deliberately empty until real hotel content is supplied. Never seed demo rooms here.
/** @type {Room[]} */
export const publishedRooms = [];
