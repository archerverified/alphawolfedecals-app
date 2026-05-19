import { VerifyForm } from '../../../components/auth/VerifyForm';
import { getOrCreateFormCsrfToken } from '../../../lib/csrf';

export const metadata = {
  title: 'Verify your email — Alpha Wolf Wrap Studio',
};

type Search = { email?: string; type?: string };

export default async function VerifyPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { email = '', type = 'customer' } = await searchParams;
  const accountType = type === 'shop' ? 'shop' : 'customer';
  const csrfToken = await getOrCreateFormCsrfToken();

  return (
    <>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-zinc-900">Check your email</h2>
        <p className="mt-1 text-sm text-zinc-600">
          We sent a 6-digit verification code. It's good for 10 minutes.
        </p>
      </div>
      <VerifyForm email={email} accountType={accountType} csrfToken={csrfToken} />
    </>
  );
}
