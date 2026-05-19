import Link from 'next/link';
import { SignupForm } from '../../../components/auth/SignupForm';
import { getOrCreateFormCsrfToken } from '../../../lib/csrf';

export const metadata = {
  title: 'Shop sign up — Alpha Wolf Wrap Studio',
};

export default async function ShopSignupPage() {
  const csrfToken = await getOrCreateFormCsrfToken();
  return (
    <>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-zinc-900">Create a shop account</h2>
        <p className="mt-1 text-sm text-zinc-600">Your team and printer setup are saved once.</p>
      </div>

      <SignupForm variant="shop" csrfToken={csrfToken} />

      <div className="mt-6 flex items-center justify-between text-sm text-zinc-600">
        <Link
          href="/signup"
          className="font-medium text-zinc-900 underline-offset-2 hover:underline"
        >
          I'm a customer →
        </Link>
        <Link href="/signin" className="underline-offset-2 hover:underline">
          Sign in
        </Link>
      </div>
    </>
  );
}
