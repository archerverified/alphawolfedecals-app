'use client';

import { useActionState, useState } from 'react';
import { CSRF_FIELD_NAME, passwordStrength } from '@alphawolf/auth';
import { signupCustomerAction, signupShopAction } from '../../lib/actions/signup';

type Variant = 'customer' | 'shop';

type Props = {
  variant: Variant;
  csrfToken: string;
};

type FormState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

const initialState: FormState = { ok: false };

export function SignupForm({ variant, csrfToken }: Props) {
  const action = variant === 'shop' ? signupShopAction : signupCustomerAction;
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, initialState);
  const [password, setPassword] = useState('');
  const strength = passwordStrength(password);

  // Preserve user input across validation-error re-renders.
  // Password is intentionally never echoed back from the server — user re-types it.
  const v = state.values ?? {};

  const strengthLabels = ['Too weak', 'Weak', 'Okay', 'Strong', 'Excellent'];
  const strengthColors = [
    'bg-red-500',
    'bg-orange-500',
    'bg-yellow-500',
    'bg-lime-500',
    'bg-emerald-500',
  ];

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="First name"
          name="firstName"
          autoComplete="given-name"
          required
          defaultValue={v.firstName}
          error={state.fieldErrors?.firstName}
        />
        <Field
          label="Last name"
          name="lastName"
          autoComplete="family-name"
          required
          defaultValue={v.lastName}
          error={state.fieldErrors?.lastName}
        />
      </div>

      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={v.email}
        error={state.fieldErrors?.email}
      />

      <div>
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          error={state.fieldErrors?.password}
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
          describedBy="password-strength"
        />
        <div className="mt-2" id="password-strength" aria-live="polite">
          <div className="h-1.5 w-full rounded bg-zinc-200 overflow-hidden">
            <div
              className={`h-full transition-all ${strengthColors[strength]}`}
              style={{ width: `${(strength + 1) * 20}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-zinc-600">
            {password.length ? strengthLabels[strength] : '12+ chars, 1 letter, 1 number, 1 symbol'}
          </p>
        </div>
      </div>

      {variant === 'shop' ? (
        <>
          <Field
            label="Company name"
            name="companyName"
            autoComplete="organization"
            required
            defaultValue={v.companyName}
            error={state.fieldErrors?.companyName}
          />
          <Field
            label="Phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            required
            defaultValue={v.phone}
            error={state.fieldErrors?.phone}
          />
          <Field
            label="Website (optional)"
            name="website"
            type="url"
            autoComplete="url"
            defaultValue={v.website}
            error={state.fieldErrors?.website}
          />
          <Field
            label="Business address (optional)"
            name="address"
            autoComplete="street-address"
            defaultValue={v.address}
            error={state.fieldErrors?.address}
          />
        </>
      ) : null}

      {state.message ? (
        <p
          role="alert"
          className={`text-sm rounded border px-3 py-2 ${state.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50 text-red-900'}`}
        >
          {state.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending
          ? 'Creating account…'
          : variant === 'shop'
            ? 'Create shop account'
            : 'Create account'}
      </button>
    </form>
  );
}

type FieldProps = {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  error?: string;
  minLength?: number;
  value?: string;
  defaultValue?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  describedBy?: string;
};

function Field({
  label,
  name,
  type = 'text',
  required = false,
  autoComplete,
  error,
  minLength,
  value,
  defaultValue,
  onChange,
  describedBy,
}: FieldProps) {
  const id = `field-${name}`;
  // Pick exactly one of `value` (controlled) or `defaultValue` (uncontrolled).
  // React warns if both are passed.
  const valueProps =
    value !== undefined ? { value, onChange } : { defaultValue: defaultValue ?? '' };
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-zinc-800">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        minLength={minLength}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={describedBy}
        className={`rounded-md border px-3 py-2 text-sm shadow-sm outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-200 ${error ? 'border-red-400' : 'border-zinc-300'}`}
        {...valueProps}
      />
      {error ? (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
