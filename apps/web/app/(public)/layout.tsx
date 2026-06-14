import type { ReactNode } from 'react';
import { SiteFooter } from '../../components/SiteFooter';

// Public route group (terms, privacy, share). Nested under the root layout; adds
// the shared footer so legal pages carry consistent chrome and cross-links.
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  );
}
