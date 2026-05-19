import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-12">
      <div className="mx-auto max-w-md">
        <header className="mb-8 text-center">
          <p className="text-xs uppercase tracking-widest text-zinc-500">Alpha Wolf</p>
          <h1 className="mt-1 text-2xl font-semibold text-zinc-900">Wrap Studio</h1>
        </header>
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">{children}</div>
      </div>
    </main>
  );
}
