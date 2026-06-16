// Custom 404 (Goal 10 D2). Renders for any unmatched route AND for every
// notFound() call — including requireAdmin()'s intentional 404 for non-admins
// (GH-004: don't reveal an admin route's existence). Previously these produced
// the bare, bodyless Next.js 404, which read as "route not deployed" right after
// a deploy (the post-deploy 404-quirk); giving it a real body removes that
// ambiguity while keeping the route-hiding behaviour.

import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-medium text-zinc-500">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">Page not found</h1>
      <p className="mt-3 text-sm leading-6 text-zinc-600">
        We couldn’t find that page. It may have moved, or you may not have access.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
      >
        Go home
      </Link>
    </main>
  );
}
