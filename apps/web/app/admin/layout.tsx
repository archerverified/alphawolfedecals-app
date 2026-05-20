// Admin shell + gate. requireAdmin() 404s non-admins, so the whole /admin
// subtree is invisible to non-staff (GH-004). Server actions under /admin must
// re-check requireAdmin themselves — a layout does not protect action POSTs.

import type { ReactNode } from 'react';
import Link from 'next/link';
import { requireAdmin } from '../../lib/admin/guard';
import { signOutAction } from '../../lib/actions/signin';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdmin();

  return (
    <div className="min-h-screen bg-zinc-100">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/admin/vehicles" className="text-sm font-semibold text-zinc-900">
              Alpha Wolf · Admin
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/admin/vehicles" className="text-zinc-600 hover:text-zinc-900">
                Vehicles
              </Link>
              <Link href="/admin/vehicles/new" className="text-zinc-600 hover:text-zinc-900">
                New template
              </Link>
              <Link href="/admin/vehicles/requests" className="text-zinc-600 hover:text-zinc-900">
                Requests
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-zinc-500 sm:inline">{admin.email}</span>
            <form action={signOutAction}>
              <button type="submit" className="text-zinc-600 underline-offset-2 hover:underline">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
