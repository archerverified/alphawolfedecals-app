// Client-safe CSRF constants. Imported by both the server (for cookie/token
// generation) and the client (for form-field naming).
//
// The actual generateCsrfToken / verifyCsrf functions stay in ./csrf because
// they depend on node:crypto which is server-only.

export const CSRF_COOKIE_NAME = 'alphawolf.csrf-form';
export const CSRF_FIELD_NAME = '_csrf';
