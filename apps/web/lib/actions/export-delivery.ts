'use server';

// Spec-pack delivery (Goal 5 / B2C-010): email-to-self + send-to-shop, both
// the SAME pdf the download route serves (one builder, ADR-free reuse).
// Route-to-platform-order is the editor's existing Goal 3a submit flow — the
// Review step links to it; no new order path is created here.
//
// Rate-limited per user via the shared rate-limit repo: an authenticated
// account must not become an outbound-mail cannon (5 sends / 15 min).

import { rateLimit } from '@alphawolf/db';
import { sendEmail } from '@alphawolf/auth/email';
import { requireUser } from '../admin/guard';
import { captureServerEvent } from '../notifications/posthog-server';
import { loadSpecPackData } from '../export/load-spec-pack-data';
import { buildSpecPack } from '../export/spec-pack';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const RATE = { windowMs: 15 * 60 * 1000, threshold: 5, lockoutMs: 15 * 60 * 1000 };

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type DeliverResult =
  | { ok: true; to: string }
  | { ok: false; reason: 'invalid_email' | 'not_found' | 'rate_limited' | 'send_failed' };

export async function emailSpecPackAction(input: {
  projectId: string;
  /** 'self' → the account email; 'shop' → the address the customer typed. */
  channel: 'self' | 'shop';
  shopEmail?: string;
}): Promise<DeliverResult> {
  const user = await requireUser(`/projects/${input.projectId}/brief`);

  const to = input.channel === 'self' ? user.email : (input.shopEmail ?? '').trim();
  if (!EMAIL_RE.test(to)) return { ok: false, reason: 'invalid_email' };

  // recordFailure is the repo's generic sliding-window counter: every send
  // attempt consumes one unit; over-threshold locks the key out.
  const decision = await rateLimit.recordFailure({
    key: `export-email:${user.id}`,
    windowMs: RATE.windowMs,
    threshold: RATE.threshold,
    lockoutMs: RATE.lockoutMs,
  });
  if (!decision.allowed) return { ok: false, reason: 'rate_limited' };

  const data = await loadSpecPackData(
    user.id,
    { name: `${user.firstName} ${user.lastName}`.trim(), email: user.email, phone: user.phone },
    input.projectId,
  );
  if (!data) return { ok: false, reason: 'not_found' };

  const pdf = await buildSpecPack(data);
  const filename = `wrap-spec-${data.projectName.replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 60) || 'pack'}.pdf`;

  const intro =
    input.channel === 'self'
      ? 'Here is the Wrap Spec Pack for your design.'
      : `${escapeHtml(data.customer.name)} built this wrap design with Alpha Wolf Wrap Studio and would like a quote. The full spec is attached — colors as film SKUs, zone sizes, tint, and condition photos.`;
  const subject =
    input.channel === 'self'
      ? `Your Wrap Spec Pack — ${data.projectName}`
      : `Wrap quote request — ${data.vehicle.label}`;

  try {
    await sendEmail({
      to,
      subject,
      html: `<!doctype html><html lang="en"><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; color: #111;">
<h1 style="font-size: 18px; margin: 0 0 12px;">${escapeHtml(data.projectName)}</h1>
<p style="margin: 0 0 12px;">${intro}</p>
<p style="margin: 0 0 12px; font-size: 14px; color: #555;">${escapeHtml(data.vehicle.label)}</p>
<p style="margin: 0; font-size: 12px; color: #777;">Designed with Alpha Wolf Wrap Studio.</p>
</body></html>`,
      text: `${data.projectName}\n\n${input.channel === 'self' ? 'Your Wrap Spec Pack is attached.' : `${data.customer.name} would like a wrap quote — the spec pack is attached.`}\n${data.vehicle.label}\n\nDesigned with Alpha Wolf Wrap Studio.`,
      attachments: [{ filename, content: Buffer.from(pdf) }],
    });
  } catch {
    return { ok: false, reason: 'send_failed' };
  }

  await captureServerEvent('export_delivered', user.id, {
    projectId: input.projectId,
    channel: input.channel,
  });
  return { ok: true, to };
}
