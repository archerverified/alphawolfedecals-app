// @alphawolf/notifications — shared types for order email dispatch.
//
// The package is intentionally PURE: it renders templates and orchestrates a
// send, but every side effect (Resend, PostHog, Sentry, the BullMQ retry queue)
// is injected via NotificationEffects. That keeps this module dependency-free,
// edge-runtime-safe, and trivially unit-testable, while the caller (apps/web)
// wires the real clients — reusing @alphawolf/auth's single Resend instance.

// The four MVP order notifications. Names track the canonical OrderStatus enum
// (packages/db/prisma/schema.prisma: submitted, in_production, fulfilled,
// cancelled) rather than the spec's prose ("accepted"/"completed"), since the
// enum is the source of truth:
//   order_submitted     -> customer, on order creation ("we received your design")
//   order_received      -> shop/ops, on order creation ("new order: <vehicle>")
//   order_in_production  -> customer, on submitted -> in_production ("accepted")
//   order_fulfilled     -> customer, on -> fulfilled ("ready for pickup")
export const NOTIFICATION_KINDS = [
  'order_submitted',
  'order_received',
  'order_in_production',
  'order_fulfilled',
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

// BullMQ queue name for the email retry queue. One source of truth shared by the
// producer (apps/web lib/notifications/retry-queue.ts) and the consumer
// (apps/api src/queue/email-worker.ts) so the two sides can never drift.
export const EMAIL_QUEUE_NAME = 'email';

// PII-safe payload. ONLY a first name, a human-readable order ref, and a vehicle
// label ever reach a template. No full email, phone, or address — the caller is
// responsible for narrowing an order row down to exactly these fields.
export interface OrderEmailData {
  firstName: string;
  orderNumber: string;
  vehicleLabel: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export interface EmailMessage extends RenderedEmail {
  to: string;
}

// A failed send re-enqueued for retry carries the fully-rendered message plus its
// kind (so the worker can re-instrument the retry attempt).
export interface EmailRetryJob extends EmailMessage {
  kind: NotificationKind;
}

export type NotificationEvent = 'email_sent' | 'email_delivery_failed';

// Injected side effects. send() is required; the rest are best-effort and
// optional so a caller (or a test) can wire only what it needs.
export interface NotificationEffects {
  send(message: EmailMessage): Promise<void>;
  // capture is awaited by dispatch so an HTTP-based analytics flush (PostHog over
  // fetch) completes before the serverless function can freeze. May be sync.
  capture?(event: NotificationEvent, props: Record<string, unknown>): void | Promise<void>;
  captureException?(error: unknown, context?: Record<string, unknown>): void;
  enqueueRetry?(job: EmailRetryJob): Promise<void>;
}

export interface DispatchResult {
  kind: NotificationKind;
  sent: boolean;
  queuedForRetry: boolean;
}
