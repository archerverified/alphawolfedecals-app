import { VerifyForm } from '../../../components/auth/VerifyForm';
import { getOrCreateFormCsrfToken } from '../../../lib/csrf';

export const metadata = {
  title: 'Verify your email — Alpha Wolf Wrap Studio',
};

// sent=0 — signup created the account but the verification email failed to
// send (e.g. Resend rejected it). The Resend button below retries the send.
type Search = { email?: string; type?: string; sent?: string };

export default async function VerifyPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { email = '', type = 'customer', sent } = await searchParams;
  const accountType = type === 'shop' ? 'shop' : 'customer';
  const sendFailed = sent === '0';
  const csrfToken = await getOrCreateFormCsrfToken();

  return (
    <>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-zinc-900">
          {sendFailed ? 'Almost there' : 'Check your email'}
        </h2>
        {sendFailed ? (
          <p
            role="alert"
            className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          >
            Your account was created, but we couldn't send the verification code. Tap
            &ldquo;Resend&rdquo; below to try again.
          </p>
        ) : (
          <p className="mt-1 text-sm text-zinc-600">
            We sent a 6-digit verification code. It's good for 10 minutes.
          </p>
        )}
      </div>
      <VerifyForm email={email} accountType={accountType} csrfToken={csrfToken} />
    </>
  );
}
