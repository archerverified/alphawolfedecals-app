import Link from 'next/link';
import { SignupForm } from '../../../components/auth/SignupForm';
import { getOrCreateFormCsrfToken } from '../../../lib/csrf';

export const metadata = {
  title: 'Sign up — Alpha Wolf Wrap Studio',
};

export default async function CustomerSignupPage() {
  const csrfToken = await getOrCreateFormCsrfToken();
  return (
    <>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-zinc-900">Create your account</h2>
        <p className="mt-1 text-sm text-zinc-600">Design a wrap for your vehicle in minutes.</p>
      </div>

      <SignupForm variant="customer" csrfToken={csrfToken} />

      <div className="mt-6 flex items-center justify-between text-sm text-zinc-600">
        <Link
          href="/signup-shop"
          className="font-medium text-zinc-900 underline-offset-2 hover:underline"
        >
          I run a wrap shop →
        </Link>
        {/* Sign-in flow lands in a follow-on PR. See activities.md. */}
      </div>
    </>
  );
}
