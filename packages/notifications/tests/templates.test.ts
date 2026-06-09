import { describe, expect, it } from 'vitest';
import {
  NOTIFICATION_KINDS,
  renderOrderEmail,
  type NotificationKind,
  type OrderEmailData,
} from '../src/index.js';

const DATA: OrderEmailData = {
  firstName: 'Casey',
  orderNumber: 'A1B2C3D4',
  vehicleLabel: 'Ford Transit 2021',
};

describe('renderOrderEmail', () => {
  it.each(NOTIFICATION_KINDS)('renders a complete email for %s', (kind) => {
    const email = renderOrderEmail(kind, DATA);
    expect(email.subject.length).toBeGreaterThan(0);
    expect(email.html.length).toBeGreaterThan(0);
    expect(email.text.length).toBeGreaterThan(0);
    // The order number always reaches the recipient (both subject + body).
    expect(email.subject).toContain(DATA.orderNumber);
    expect(email.html).toContain(DATA.orderNumber);
    expect(email.text).toContain(DATA.orderNumber);
  });

  it('addresses the customer by first name (submitted/in_production/fulfilled)', () => {
    for (const kind of ['order_submitted', 'order_in_production', 'order_fulfilled'] as const) {
      const email = renderOrderEmail(kind, DATA);
      expect(email.html).toContain(DATA.firstName);
      expect(email.text).toContain(DATA.firstName);
    }
  });

  it('names the vehicle for the shop receipt + customer status emails', () => {
    for (const kind of ['order_received', 'order_in_production', 'order_fulfilled'] as const) {
      const email = renderOrderEmail(kind, DATA);
      expect(email.html).toContain(DATA.vehicleLabel);
    }
  });

  // PII discipline (spec: only first name + order number + vehicle; NO full
  // email/phone/address). The type only carries safe fields, but assert that
  // nothing template-side leaks an obvious email/phone shape.
  it('never emits an @-address or phone-shaped string', () => {
    for (const kind of NOTIFICATION_KINDS) {
      const email = renderOrderEmail(kind, DATA);
      const blob = `${email.subject}\n${email.html}\n${email.text}`;
      expect(blob).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
      expect(blob).not.toMatch(/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/);
    }
  });

  // Security: a hostile first name / vehicle label must not inject raw HTML into
  // the message body (email content is security-reviewed per .coderabbit.yaml).
  it('HTML-escapes interpolated values', () => {
    const hostile: OrderEmailData = {
      firstName: '<script>alert(1)</script>',
      orderNumber: '<b>X</b>',
      vehicleLabel: 'Ford "Transit" & <Van>',
    };
    const email = renderOrderEmail('order_submitted', hostile);
    expect(email.html).not.toContain('<script>');
    expect(email.html).not.toContain('<b>X</b>');
    expect(email.html).toContain('&lt;script&gt;');
    // The plain-text part keeps the raw characters (no markup to escape).
    expect(email.text).toContain('<script>alert(1)</script>');
  });

  it('produces a distinct subject per kind', () => {
    const subjects = NOTIFICATION_KINDS.map(
      (k: NotificationKind) => renderOrderEmail(k, DATA).subject,
    );
    expect(new Set(subjects).size).toBe(subjects.length);
  });
});
