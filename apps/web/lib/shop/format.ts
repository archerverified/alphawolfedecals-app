// Shared formatting helpers for the shop dashboard. Used by the order list and
// the order detail page so timestamps render identically across both.

const DATE_TIME = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

// e.g. "Jun 8, 2026, 1:43 AM". Rendered server-side (the dashboard routes are
// force-dynamic), so there is no client/server locale hydration mismatch.
export function formatOrderDate(date: Date): string {
  return DATE_TIME.format(date);
}
