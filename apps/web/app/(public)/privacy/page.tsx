import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  robots: { index: false, follow: false },
};

// STUB (Goal 4). Placeholder route so legal links resolve and the security-audit
// privacy gap is closed structurally. Binding copy is owned by Archer and must
// replace this before public launch. The app DOES collect PII (email, contact
// details, uploaded artwork) — the real policy must describe collection, storage
// (Supabase us-west-1), encryption (PII columns are encrypted at rest), retention,
// and deletion. See docs/deployment/audits/2026-06-09-goal-4/security-audit.md.
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <strong>[[PLACEHOLDER — pending Archer legal copy]]</strong> Draft — not yet in force. This
        is a placeholder pending legal review and must be replaced with reviewed copy before public
        launch.
      </p>

      <section className="mt-8 space-y-6 text-sm leading-6 text-neutral-700">
        <div>
          <h2 className="text-lg font-medium text-neutral-900">What we collect</h2>
          <p className="mt-2">
            Account details (email, password hash), contact information you provide on an order, and
            the artwork you upload to design a wrap. [Placeholder.]
          </p>
        </div>
        <div>
          <h2 className="text-lg font-medium text-neutral-900">How we store it</h2>
          <p className="mt-2">
            Data is stored in a managed Postgres database (Supabase, US-West region). Personal data
            fields are encrypted at rest; uploaded artwork lives in a private storage bucket
            accessible only through short-lived, ownership-checked signed URLs. [Placeholder.]
          </p>
        </div>
        <div>
          <h2 className="text-lg font-medium text-neutral-900">Your choices</h2>
          <p className="mt-2">
            You may request access to or deletion of your data. [Placeholder — wire the request path
            before launch.]
          </p>
        </div>
        <div>
          <h2 className="text-lg font-medium text-neutral-900">Contact</h2>
          <p className="mt-2">Privacy questions: privacy@alphawolfdecals.com. [Placeholder.]</p>
        </div>
      </section>
    </main>
  );
}
