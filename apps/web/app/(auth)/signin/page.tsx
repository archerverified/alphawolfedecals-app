import { SignInForm } from '../../../components/auth/SignInForm';

export const metadata = {
  title: 'Sign in',
};

type Search = { next?: string };

export default async function SignInPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { next = '/vehicles/select' } = await searchParams;

  return (
    <>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-zinc-900">Welcome back</h2>
        <p className="mt-1 text-sm text-zinc-600">Sign in to design or manage wrap templates.</p>
      </div>
      <SignInForm next={next} />
    </>
  );
}
