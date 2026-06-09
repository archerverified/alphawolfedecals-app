// Order email templates. Plain inline-styled HTML — no remote assets, no
// tracking pixels (mirrors the OTP email in @alphawolf/auth: keeps the spam
// score low and stays under Gmail's 102 KB clipping threshold).
//
// PII discipline: a template only ever sees an OrderEmailData (firstName,
// orderNumber, vehicleLabel). Every interpolated value is HTML-escaped before it
// lands in markup so a hostile name/label can't inject tags into the body.

import type { NotificationKind, OrderEmailData, RenderedEmail } from './types.js';

const BRAND = 'Alpha Wolf Wrap Studio';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// One shared shell so every notification reads consistently. `preheader` is the
// hidden inbox-preview line; `bodyHtml` is already-escaped, trusted markup.
function layout(preheader: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; color: #111;">
    <span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${escapeHtml(
      preheader,
    )}</span>
    ${bodyHtml}
    <hr style="border:none;border-top:1px solid #e4e4e7;margin:32px 0 16px;" />
    <p style="margin:0;font-size:12px;color:#777;">${escapeHtml(BRAND)}</p>
  </body>
</html>`;
}

interface TemplateParts {
  subject: string;
  // The visible HTML heading + paragraphs (already escaped via the data fields).
  bodyHtml: string;
  preheader: string;
  text: string;
}

function build(parts: TemplateParts): RenderedEmail {
  return {
    subject: parts.subject,
    html: layout(parts.preheader, parts.bodyHtml),
    text: `${parts.text}\n\n— ${BRAND}`,
  };
}

type TemplateFn = (data: OrderEmailData) => RenderedEmail;

const orderSubmitted: TemplateFn = (data) => {
  const name = escapeHtml(data.firstName);
  const order = escapeHtml(data.orderNumber);
  const vehicle = escapeHtml(data.vehicleLabel);
  return build({
    subject: `We received your design (Order #${data.orderNumber})`,
    preheader: `Your ${data.vehicleLabel} design is in the production queue.`,
    bodyHtml: `<h1 style="font-size:20px;margin:0 0 16px;">Thanks, ${name} — we've got your design</h1>
    <p style="margin:0 0 16px;">Your <strong>${vehicle}</strong> design has been submitted for production and is now in the queue. Order <strong>#${order}</strong>.</p>
    <p style="margin:0;color:#555;">The production team will review it and reach out to confirm the details. You can keep editing — your next changes start a fresh draft.</p>`,
    text: `Thanks, ${data.firstName} — we've got your design.\n\nYour ${data.vehicleLabel} design has been submitted for production and is in the queue. Order #${data.orderNumber}.\n\nThe production team will review it and reach out to confirm the details.`,
  });
};

const orderReceived: TemplateFn = (data) => {
  const name = escapeHtml(data.firstName);
  const order = escapeHtml(data.orderNumber);
  const vehicle = escapeHtml(data.vehicleLabel);
  return build({
    subject: `New order: ${data.vehicleLabel} (#${data.orderNumber})`,
    preheader: `A new ${data.vehicleLabel} wrap order is ready to review.`,
    bodyHtml: `<h1 style="font-size:20px;margin:0 0 16px;">New order received</h1>
    <p style="margin:0 0 16px;">A new wrap order just came in for a <strong>${vehicle}</strong>. Order <strong>#${order}</strong>.</p>
    <p style="margin:0;color:#555;">Customer first name: ${name}. Open the dashboard to review the design and accept the job.</p>`,
    text: `New order received.\n\nA new wrap order came in for a ${data.vehicleLabel}. Order #${data.orderNumber}.\nCustomer first name: ${data.firstName}.\n\nOpen the dashboard to review the design and accept the job.`,
  });
};

const orderInProduction: TemplateFn = (data) => {
  const name = escapeHtml(data.firstName);
  const order = escapeHtml(data.orderNumber);
  const vehicle = escapeHtml(data.vehicleLabel);
  return build({
    subject: `Your order is in production (#${data.orderNumber})`,
    preheader: `Your shop accepted your ${data.vehicleLabel} order.`,
    bodyHtml: `<h1 style="font-size:20px;margin:0 0 16px;">Good news, ${name} — your order is moving</h1>
    <p style="margin:0 0 16px;">Your shop accepted your order and started production on your <strong>${vehicle}</strong> wrap. Order <strong>#${order}</strong>.</p>
    <p style="margin:0;color:#555;">We'll let you know the moment it's ready for pickup.</p>`,
    text: `Good news, ${data.firstName} — your order is moving.\n\nYour shop accepted your order and started production on your ${data.vehicleLabel} wrap. Order #${data.orderNumber}.\n\nWe'll let you know the moment it's ready for pickup.`,
  });
};

const orderFulfilled: TemplateFn = (data) => {
  const name = escapeHtml(data.firstName);
  const order = escapeHtml(data.orderNumber);
  const vehicle = escapeHtml(data.vehicleLabel);
  return build({
    subject: `Your wrap is ready for pickup (#${data.orderNumber})`,
    preheader: `Your ${data.vehicleLabel} wrap is ready.`,
    bodyHtml: `<h1 style="font-size:20px;margin:0 0 16px;">Your wrap is ready, ${name}!</h1>
    <p style="margin:0 0 16px;">Your <strong>${vehicle}</strong> wrap is complete and ready for pickup. Order <strong>#${order}</strong>.</p>
    <p style="margin:0;color:#555;">Your shop will be in touch to arrange a time. Thanks for wrapping with us.</p>`,
    text: `Your wrap is ready, ${data.firstName}!\n\nYour ${data.vehicleLabel} wrap is complete and ready for pickup. Order #${data.orderNumber}.\n\nYour shop will be in touch to arrange a time.`,
  });
};

const TEMPLATES: Record<NotificationKind, TemplateFn> = {
  order_submitted: orderSubmitted,
  order_received: orderReceived,
  order_in_production: orderInProduction,
  order_fulfilled: orderFulfilled,
};

export function renderOrderEmail(kind: NotificationKind, data: OrderEmailData): RenderedEmail {
  return TEMPLATES[kind](data);
}
