'use client';

// Spec-pack delivery panel (Goal 5 / B2C-010), shown on the wizard's Review
// step: download (B2C-009 route), email-to-self, send-to-shop, and the
// route-to-platform-order seam (the editor's existing Goal 3a submit flow).

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Download, Loader2, Mail, Send, Store } from 'lucide-react';
import { Button } from '@alphawolf/ui/components/ui/button';
import { emailSpecPackAction } from '@/lib/actions/export-delivery';

interface Props {
  projectId: string;
  /** Flush pending autosaves before generating, so the pack matches the screen. */
  flushNow: () => void;
}

const FRIENDLY: Record<string, string> = {
  invalid_email: "That email doesn't look right.",
  not_found: 'Could not load this project.',
  rate_limited: "That's a lot of emails — try again in 15 minutes.",
  send_failed: "Couldn't send right now. Download the PDF instead.",
};

export function DeliveryPanel({ projectId, flushNow }: Props) {
  const [shopEmail, setShopEmail] = useState('');
  const [busy, setBusy] = useState<'self' | 'shop' | null>(null);

  const send = async (channel: 'self' | 'shop') => {
    flushNow();
    setBusy(channel);
    try {
      const res = await emailSpecPackAction({
        projectId,
        channel,
        shopEmail: channel === 'shop' ? shopEmail : undefined,
      });
      if (res.ok) {
        toast.success(channel === 'self' ? `Sent to ${res.to}.` : `Sent to ${res.to}.`);
        if (channel === 'shop') setShopEmail('');
      } else {
        toast.error(FRIENDLY[res.reason] ?? 'Could not send.');
      }
    } catch {
      toast.error('Could not send.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="mt-6 rounded-md border border-zinc-200 bg-white p-4"
      data-testid="delivery-panel"
    >
      <h3 className="text-sm font-semibold">Get your spec pack to a shop</h3>
      <p className="mb-3 mt-1 text-xs text-zinc-500">
        The PDF carries everything a wrap shop needs to quote you — no prices from us, ever.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <a href={`/projects/${projectId}/export`} onClick={flushNow}>
            <Download className="size-4" aria-hidden /> Download PDF
          </a>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy !== null}
          onClick={() => void send('self')}
          data-testid="delivery-email-self"
        >
          {busy === 'self' ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Mail className="size-4" aria-hidden />
          )}
          Email it to me
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/projects/${projectId}/editor`} data-testid="delivery-submit-order">
            <Store className="size-4" aria-hidden /> Submit to a shop on Alpha Wolf
          </Link>
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label htmlFor="shop-email" className="text-xs text-zinc-500">
          Or email it straight to your shop:
        </label>
        <input
          id="shop-email"
          type="email"
          value={shopEmail}
          onChange={(e) => setShopEmail(e.target.value)}
          placeholder="quotes@yourshop.com"
          data-testid="delivery-shop-email"
          className="w-56 rounded-md border border-zinc-200 p-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
        />
        <Button
          type="button"
          size="sm"
          disabled={busy !== null || !shopEmail}
          onClick={() => void send('shop')}
          data-testid="delivery-send-shop"
        >
          {busy === 'shop' ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Send className="size-4" aria-hidden />
          )}
          Send
        </Button>
      </div>
      <p className="mt-2 text-[11px] text-zinc-400">
        "Submit to a shop on Alpha Wolf" opens your design in the editor — the Submit button there
        sends it into a shop's order queue.
      </p>
    </div>
  );
}
