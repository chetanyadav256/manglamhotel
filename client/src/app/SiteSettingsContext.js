import { createContext, useContext } from 'react';
import { contact } from '../config/contact.js';

function phoneLink(label) {
  return { label, href: `tel:${label.replace(/[^\d+]/g, '')}` };
}

export function fallbackSiteSettings() {
  return {
    hotelName: contact.hotelName,
    phones: contact.phones,
    instagram: contact.instagram,
    address: contact.address.join('\n'),
    maps: contact.maps,
  };
}

export function toPublicSiteSettings(settings) {
  if (!settings || !Array.isArray(settings.phoneNumbers) || settings.phoneNumbers.length !== 2
    || !settings.phoneNumbers.every((phone) => typeof phone === 'string')
    || typeof settings.hotelName !== 'string'
    || typeof settings.instagramUrl !== 'string'
    || typeof settings.address !== 'string'
    || typeof settings.googleMapsUrl !== 'string') return fallbackSiteSettings();
  return {
    hotelName: settings.hotelName,
    phones: settings.phoneNumbers.map(phoneLink),
    instagram: settings.instagramUrl,
    address: settings.address,
    maps: settings.googleMapsUrl,
  };
}

export const SiteSettingsContext = createContext(fallbackSiteSettings());

export function useSiteSettings() {
  return useContext(SiteSettingsContext);
}
