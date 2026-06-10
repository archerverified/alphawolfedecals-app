// Goal 4 DELIVERABLE 0.5 — seed the two verified accounts the prod MVP smoke
// (apps/web/e2e/mvp-flow.spec.ts) needs.
//
// Uses the app's REAL creation path — @alphawolf/auth `hashPassword` (argon2id) +
// the @alphawolf/db `users`/`shops` repos — NOT raw SQL. Passwords are argon2id
// and `email_lower_hash` is a keyed HMAC computed by a pgcrypto SQL function, so
// an account can only be created through the code that owns those primitives.
// `createUser` + `markUserActive` is exactly what `signupCustomer` + a verified
// OTP do; `createShopWithAdminMembership` is exactly what shop signup verify does.
// We skip only the OTP email round-trip (an email-delivery concern, not a
// user-creation one) so seeding is deterministic and sends no mail.
//
// Creates: 1 verified customer + 1 verified shop_user with a shop_admin membership
// in a dedicated "Smoke Test Shop". Strong random creds, written to a 0600 file
// (default /tmp/aw-smoke-creds.env) so passwords never land in stdout/logs.
//
// Run against the PROD DB via the DIRECT (non-pooled) connection — crypto.ts uses
// `$queryRaw` tagged templates that collide on the pgBouncer transaction pooler.
// DIRECT_URL is promoted to DATABASE_URL below (read lazily by withSystem), e.g.:
//   dotenv -e <abs>/packages/db/.env -- tsx scripts/seed-smoke-accounts.ts

import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';

// Force the system connection onto the DIRECT (5432, non-pooled) URL before the
// db client reads DATABASE_URL (lazy — first withSystem call, inside main()).
if (process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}

const OUT_PATH = process.env.SMOKE_OUT ?? '/tmp/aw-smoke-creds.env';

function strongSecret(bytes = 18): string {
  // base64url (no padding): 24 chars for 18 bytes; mixed case + digits.
  return randomBytes(bytes).toString('base64url');
}

function tag(): string {
  return randomBytes(4).toString('hex');
}

function redactUrl(url: string | undefined): string {
  return (url ?? '').replace(/:\/\/([^:]+):[^@]+@/, '://$1:<redacted>@');
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL/DIRECT_URL not set — load the .env');
  if (!process.env.PII_ENCRYPTION_KEY)
    throw new Error('PII_ENCRYPTION_KEY not set — load the .env');

  const { hashPassword } = await import('@alphawolf/auth/server');
  const { users, shops, projects, orders } = await import('@alphawolf/db');

  // A published vehicle to hang the routed-order's project on (BMW X3 AW template).
  const PUBLISHED_VEHICLE_ID = 'aa000001-0000-4000-8000-000000000001';

  const stamp = tag();
  const customerEmail = `smoke-customer-${stamp}@alphawolf.test`;
  const customerPassword = strongSecret();
  const shopEmail = `smoke-shop-${stamp}@alphawolf.test`;
  const shopPassword = strongSecret();
  const SHOP_NAME = 'Smoke Test Shop';
  const SHOP_PHONE = '+15555550100';

  console.log('[seed] target DB:', redactUrl(process.env.DATABASE_URL));

  // 1) Verified customer.
  const customer = await users.createUser({
    email: customerEmail,
    firstName: 'Smoke',
    lastName: 'Customer',
    passwordHash: await hashPassword(customerPassword),
    accountType: 'customer',
  });
  await users.markUserActive(customer.id);

  // 2) Verified shop_user + shop + admin membership.
  const shopUser = await users.createUser({
    email: shopEmail,
    firstName: 'Smoke',
    lastName: 'Shop',
    phone: SHOP_PHONE,
    passwordHash: await hashPassword(shopPassword),
    accountType: 'shop_user',
  });
  await users.markUserActive(shopUser.id);
  const shop = await shops.createShopWithAdminMembership({
    ownerUserId: shopUser.id,
    companyName: SHOP_NAME,
    phone: SHOP_PHONE,
    website: null,
    address: null,
  });

  // 3) A submitted order ROUTED to the smoke shop, so the shop-loop has something
  // to accept→complete. The MVP customer UI never routes an order to a shop
  // (project.ownerShopId is never set), so we create the project with
  // ownerShopId pinned and submit it — the order inherits ownerShopId from the
  // project (orders.submitForProduction), making it visible via orders_shop_read.
  // NB: unlike the user/shop creation above (withSystem → the promoted DIRECT
  // DATABASE_URL), createProject + submitForProduction run via withUser
  // (DATABASE_URL_APP, the pooled app_user). That's fine: they use the Prisma
  // query builder, not the crypto.ts $queryRaw that collides on the txn pooler.
  const { projectId } = await projects.createProject(customer.id, {
    vehicleId: PUBLISHED_VEHICLE_ID,
    name: 'Smoke routed order',
    ownerShopId: shop.id,
    initialCanvasState: {},
  });
  const submitted = await orders.submitForProduction(customer.id, {
    projectId,
    contactName: 'Smoke Customer',
    contactEmail: customerEmail,
    deliveryNotes: 'Seeded routed order for the shop-loop smoke (Goal 4).',
  });
  if (!submitted.ok) throw new Error(`routed-order submit failed: ${submitted.reason}`);

  const lines = [
    `SMOKE_CUSTOMER_EMAIL=${customerEmail}`,
    `SMOKE_CUSTOMER_PASSWORD=${customerPassword}`,
    `SMOKE_SHOP_EMAIL=${shopEmail}`,
    `SMOKE_SHOP_PASSWORD=${shopPassword}`,
    `SMOKE_INCLUDE_SHOP=1`,
    '',
  ].join('\n');
  writeFileSync(OUT_PATH, lines, { mode: 0o600 });

  // stdout: identifiers only — NO passwords.
  console.log('\n=== smoke accounts created (verified) ===');
  console.log(`customer.id = ${customer.id}  <${customerEmail}>`);
  console.log(`shopUser.id = ${shopUser.id}  <${shopEmail}>`);
  console.log(`shop.id     = ${shop.id}  ("${SHOP_NAME}")`);
  console.log(`routedOrder = ${submitted.orderId}  (status=${submitted.status}, routed to shop)`);
  console.log(`\ncredentials (incl. passwords) written 0600 to: ${OUT_PATH}`);
  console.log('=========================================\n');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[seed-smoke-accounts] FAILED:', err);
    process.exit(1);
  });
