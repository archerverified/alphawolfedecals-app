import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service',
  // Placeholder route — keep it out of the index until real copy lands.
  robots: { index: false, follow: false },
};

// STUB (Goal 4). Placeholder route so the footer/legal links resolve and the
// production-readiness gap (#21) is closed structurally. The binding legal copy
// is owned by Archer and must replace this before public launch — see
// docs/deployment/audits/2026-06-09-goal-4/production-readiness.md.
export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Terms of Service</h1>
      <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <strong>[[PLACEHOLDER — pending Archer legal copy]]</strong> Draft — not yet in force. This
        is a placeholder pending legal review. It does not constitute the operative Terms of Service
        and must be replaced with reviewed copy before public launch.
      </p>

      <section className="mt-8 space-y-6 text-sm leading-6 text-neutral-700">
        <div>
          <h2 className="text-lg font-medium text-neutral-900">1. Acceptance of terms</h2>
          <p className="mt-2">
            By accessing Alpha Wolf Wrap Studio you agree to these terms. [Placeholder.]
          </p>
        </div>
        <div>
          <h2 className="text-lg font-medium text-neutral-900">2. Use of the service</h2>
          <p className="mt-2">
            The service lets you browse vehicle templates, design wraps, and submit designs to a
            wrap shop for production. [Placeholder.]
          </p>
        </div>
        <div>
          <h2 className="text-lg font-medium text-neutral-900">3. Accounts &amp; content</h2>
          <p className="mt-2">
            You are responsible for your account credentials and for the artwork you upload.
            [Placeholder.]
          </p>
        </div>
        <div>
          <h2 className="text-lg font-medium text-neutral-900">4. Contact</h2>
          <p className="mt-2">
            Questions about these terms: support@alphawolfdecals.com. [Placeholder.]
          </p>
        </div>
      </section>
    </main>
  );
}
