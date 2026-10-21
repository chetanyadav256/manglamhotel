const hotelNameFallback = 'Manglam Hotel & Restaurant';

const publicRoutes = {
  '/': {
    title: (hotelName) => `${hotelName} | Hotel & Restaurant`,
    description: (hotelName) => `Visit ${hotelName} in Kalwad, Rajasthan. Explore rooms, browse the restaurant menu and contact our team.`,
  },
  '/rooms': {
    title: (hotelName) => `Rooms & Accommodation | ${hotelName}`,
    description: (hotelName) => `Enquire about rooms at ${hotelName} in Kalwad, Rajasthan. Contact our team for room details, current prices and availability.`,
  },
  '/restaurant': {
    title: (hotelName) => `Restaurant Menu | ${hotelName}`,
    description: (hotelName) => `Explore the restaurant menu at ${hotelName} in Kalwad, Rajasthan.`,
  },
  '/contact': {
    title: (hotelName) => `Contact | ${hotelName}`,
    description: (hotelName) => `Contact ${hotelName} in Kalwad, Rajasthan by phone, Instagram or Google Maps.`,
  },
};

export function normalizePathname(pathname) {
  if (typeof pathname !== 'string' || !pathname.startsWith('/')) return '/';
  const normalized = pathname.replace(/\/+$/, '');
  return normalized || '/';
}

export function getPageMetadata(pathname, hotelName = hotelNameFallback) {
  const normalizedPath = normalizePathname(pathname);
  const page = publicRoutes[normalizedPath];
  const isAdmin = normalizedPath === '/admin' || normalizedPath.startsWith('/admin/');
  if (isAdmin) {
    const adminTitle = normalizedPath === '/admin/login'
      ? 'Admin login'
      : normalizedPath === '/admin/settings'
        ? 'Website settings'
        : normalizedPath.startsWith('/admin/rooms/')
          ? normalizedPath.endsWith('/new') ? 'Add room' : 'Edit room'
          : normalizedPath === '/admin/rooms'
            ? 'Manage rooms'
            : normalizedPath.startsWith('/admin/restaurant/')
              ? 'Edit restaurant content'
              : normalizedPath === '/admin/restaurant'
                ? 'Restaurant management'
                : 'Admin dashboard';
    return {
      title: `${adminTitle} | ${hotelName}`,
      description: 'Protected hotel administration.',
      noIndex: true,
      canonicalPath: null,
    };
  }
  if (!page) {
    return {
      title: `Page not found | ${hotelName}`,
      description: `The requested page is not available on ${hotelName}.`,
      noIndex: true,
      canonicalPath: null,
    };
  }
  return {
    title: page.title(hotelName),
    description: page.description(hotelName),
    noIndex: false,
    canonicalPath: normalizedPath,
  };
}

export function createStructuredData(settings, publicSiteUrl = '') {
  const hotelUrl = publicSiteUrl ? `${publicSiteUrl}/` : undefined;
  const restaurantUrl = publicSiteUrl ? `${publicSiteUrl}/restaurant` : undefined;
  const hotelId = hotelUrl ? `${hotelUrl}#hotel` : undefined;
  const restaurant = {
    '@type': 'Restaurant',
    name: 'Manglam Restaurant',
    telephone: settings.phones[0]?.label,
    address: {
      '@type': 'PostalAddress',
      streetAddress: settings.address,
      addressCountry: 'IN',
    },
    ...(restaurantUrl ? { '@id': `${restaurantUrl}#restaurant`, url: restaurantUrl } : {}),
    ...(hotelId ? { parentOrganization: { '@id': hotelId } } : {}),
  };
  const hotel = {
    '@type': 'Hotel',
    name: settings.hotelName,
    telephone: settings.phones[0]?.label,
    address: {
      '@type': 'PostalAddress',
      streetAddress: settings.address,
      addressCountry: 'IN',
    },
    sameAs: [settings.instagram],
    hasMap: settings.maps,
    ...(hotelId ? { '@id': hotelId, url: hotelUrl } : {}),
  };
  return { '@context': 'https://schema.org', '@graph': [hotel, restaurant] };
}
