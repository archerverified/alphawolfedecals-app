'use server';

// GH-017: a signed-in user requests a vehicle that isn't in the library yet.
// Bespoke server action -> double-submit CSRF (same pattern as signup).

import { cookies } from 'next/headers';
import { CSRF_COOKIE_NAME, CSRF_FIELD_NAME, verifyCsrf } from '@alphawolf/auth/server';
import { vehicleRequests } from '@alphawolf/db';
import { requireUser } from '../admin/guard';

type State = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

const FIELDS = ['year', 'make', 'model', 'trim', 'variant', 'notes', 'photos'];

function snapshot(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of FIELDS) {
    const v = form.get(f);
    out[f] = typeof v === 'string' ? v : '';
  }
  return out;
}

export async function submitVehicleRequestAction(_prev: State, form: FormData): Promise<State> {
  const values = snapshot(form);

  const submitted = form.get(CSRF_FIELD_NAME);
  const cookie = (await cookies()).get(CSRF_COOKIE_NAME)?.value ?? null;
  if (!verifyCsrf(cookie, typeof submitted === 'string' ? submitted : null)) {
    return { ok: false, message: 'Invalid request token. Please refresh and try again.', values };
  }

  const user = await requireUser('/vehicles/request');

  const get = (k: string): string => (values[k] ?? '').trim();
  const year = Number(get('year'));
  const make = get('make');
  const model = get('model');
  const trim = get('trim') || null;
  const variant = get('variant') || null;
  const notes = get('notes') || null;
  const notifyByEmail = form.get('notify') === 'on';
  const referencePhotoUrls = (values.photos ?? '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 10);

  const fieldErrors: Record<string, string> = {};
  const maxYear = new Date().getFullYear() + 2;
  if (!Number.isInteger(year) || year < 1990 || year > maxYear) {
    fieldErrors.year = `Enter a year between 1990 and ${maxYear}.`;
  }
  if (!make) fieldErrors.make = 'Required.';
  if (!model) fieldErrors.model = 'Required.';
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, message: 'Please fix the highlighted fields.', fieldErrors, values };
  }

  await vehicleRequests.createRequest(user.id, {
    year,
    make,
    model,
    trim,
    variant,
    notes,
    referencePhotoUrls,
    notifyByEmail,
    email: user.email,
  });

  return {
    ok: true,
    message: notifyByEmail
      ? 'Request submitted. We’ll email you when the template ships.'
      : 'Request submitted.',
  };
}
