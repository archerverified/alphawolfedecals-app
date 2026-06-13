// Static curated partner-shop directory (Goal 9 / D3 locator). Public, NON-PII
// data that Archer curates — distinct from the opted-in platform shops, which
// come from the DB. The locator shows platform shops first, then this directory,
// then a "search near you" maps fallback. Starts empty on purpose: the maps
// fallback keeps the page useful until partner shops are added here.

export type DirectoryShop = {
  name: string;
  city: string;
  region?: string;
  url?: string;
};

export const LOCATOR_DIRECTORY: DirectoryShop[] = [
  // Add curated partner shops here, e.g.:
  // { name: 'Example Wraps', city: 'Austin', region: 'TX', url: 'https://examplewraps.com' },
];

// A Google Maps search for wrap shops near a query (city / zip / "near me").
export function mapsSearchUrl(query: string): string {
  const q = query.trim() ? `vehicle wrap shop ${query.trim()}` : 'vehicle wrap shop near me';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
