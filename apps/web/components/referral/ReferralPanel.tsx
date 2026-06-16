'use client';

// Referral panel (Goal 9). Copyable link + QR (server-rendered SVG, reusing the
// export-pack QR library) + the referrer's running stats. No PII, no Stripe.

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

type Props = {
  url: string;
  /** Inline SVG markup for the referral QR (rendered server-side via lib/qr). */
  qrSvg: string;
  referredCount: number;
  creditsEarned: number;
};

export function ReferralPanel({ url, qrSvg, referredCount, creditsEarned }: Props) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked — the input is selectable as a fallback
    }
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <div
          className="mx-auto flex size-36 shrink-0 items-center justify-center rounded-xl border border-brand/20 bg-brand-soft p-3 [&>svg]:h-full [&>svg]:w-full"
          role="img"
          aria-label="Referral QR code"
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />
        <div className="min-w-0 flex-1">
          <label htmlFor="referral-url" className="text-xs font-medium text-zinc-500">
            Your referral link
          </label>
          <div className="mt-1.5 flex items-center gap-2">
            <input
              id="referral-url"
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              data-testid="referral-url"
              className="h-9 min-w-0 flex-1 rounded-md border border-zinc-300 bg-zinc-50 px-3 text-xs text-zinc-700 shadow-xs"
            />
            <button
              type="button"
              onClick={() => void copy()}
              data-testid="referral-copy"
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-zinc-900 px-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-zinc-800"
            >
              {copied ? (
                <Check className="size-4" aria-hidden />
              ) : (
                <Copy className="size-4" aria-hidden />
              )}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <dl className="mt-4 flex gap-6">
            <div>
              <dt className="text-xs text-zinc-500">Friends joined</dt>
              <dd
                className="text-lg font-semibold tabular-nums text-zinc-900"
                data-testid="referral-count"
              >
                {referredCount}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Credits earned</dt>
              <dd
                className="text-lg font-semibold tabular-nums text-emerald-700"
                data-testid="referral-earned"
              >
                {creditsEarned}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
