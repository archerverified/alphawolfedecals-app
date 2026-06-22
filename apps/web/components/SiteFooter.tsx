import Link from 'next/link';
import { SUPPORT_EMAIL } from '@/lib/contact';

// Shared site footer (Goal 10 D4). Closes the production-readiness gap where the
// /terms + /privacy routes existed but nothing linked to them. Mounted on the
// landing page, the public route group, and the authenticated dashboard — NOT the
// full-bleed editor. Keep it light: legal reachability + a support contact.
export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-6 py-6 text-sm text-zinc-500 sm:flex-row">
        <p>© {year} Alpha Wolf Wrap Studio</p>
        <nav className="flex items-center gap-4">
          <Link href="/terms" className="underline-offset-2 hover:text-zinc-900 hover:underline">
            Terms
          </Link>
          <Link href="/privacy" className="underline-offset-2 hover:text-zinc-900 hover:underline">
            Privacy
          </Link>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="underline-offset-2 hover:text-zinc-900 hover:underline"
          >
            Support
          </a>
        </nav>
      </div>
    </footer>
  );
}
