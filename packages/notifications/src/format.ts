// Helpers that narrow an order row down to the PII-safe fields a template may
// see. Pure + unit-tested so the "first name only" rule has one enforced home.

// First whitespace-delimited token of a name. Empty/whitespace -> a neutral
// greeting. Deliberately drops everything after the first token: a template
// never receives a last name (PII discipline, spec §"only first name").
export function firstNameOf(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] ?? '';
  return first || 'there';
}

// Short, human-readable order ref derived from the order UUID — matches the
// order-confirmed page (id.slice(0, 8)), uppercased for email legibility.
export function orderNumberFromId(orderId: string): string {
  return orderId.slice(0, 8).toUpperCase();
}
