// Shell for the shop dashboard (Goal 3b). Chrome only — each page gates itself
// with requireShopUser(), mirroring the customer area (/projects), rather than
// gating at the layout the way /admin does.

import Link from 'next/link';
import { SiteFooter } from '../../components/SiteFooter';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <Link href="/dashboard" className="text-sm font-semibold tracking-tight text-zinc-900">
            Alpha Wolf — Production queue
          </Link>
          <Link href="/projects" className="text-sm text-zinc-500 hover:text-zinc-900">
            My projects
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
      <SiteFooter />
    </div>
  );
}
