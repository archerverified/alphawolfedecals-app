-- Goal 9 referral give-2/get-2. Schema only; the RLS + set-once trigger live in
-- prisma/sql/auth_rls.sql (applied by db:apply-sql).

-- users: this user's own referral code + the code captured ONCE at signup. Both
-- are opaque, non-PII tokens (plaintext). Format is bounded here; referred_by_code
-- immutability is enforced by a set-once trigger in auth_rls.sql.
ALTER TABLE "users" ADD COLUMN "referral_code" TEXT;
ALTER TABLE "users" ADD COLUMN "referred_by_code" TEXT;

CREATE UNIQUE INDEX "users_referral_code_key" ON "users"("referral_code");

ALTER TABLE "users" ADD CONSTRAINT "users_referral_code_format"
  CHECK ("referral_code" IS NULL OR "referral_code" ~ '^[A-Z0-9]{6,20}$');
ALTER TABLE "users" ADD CONSTRAINT "users_referred_by_code_format"
  CHECK ("referred_by_code" IS NULL OR "referred_by_code" ~ '^[A-Z0-9]{6,20}$');

-- credit_ledger: typed referrer-grant idempotency key (architecture review C2 —
-- key on a column, not a string-concatenated reason).
ALTER TABLE "credit_ledger" ADD COLUMN "referee_user_id" UUID;

-- Partial uniques (Prisma can't express these — raw SQL by design, same as the
-- spend/refund run-scoped uniques): the referee earns the referral bonus at most
-- once; a referrer earns at most once per distinct referee. A user can be a
-- referrer many times (different referee_user_id) but a referee only once.
CREATE UNIQUE INDEX "credit_ledger_referral_referee_once"
  ON "credit_ledger"("user_id")
  WHERE source = 'referral' AND reason = 'referral_referee';
CREATE UNIQUE INDEX "credit_ledger_referral_referrer_once"
  ON "credit_ledger"("user_id", "referee_user_id")
  WHERE source = 'referral' AND reason = 'referral_referrer';

-- referral_attributions: one row per referee — the once-per-referee anchor.
CREATE TABLE "referral_attributions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "referee_user_id" UUID NOT NULL,
    "referrer_user_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "referee_ip" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_attributions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "referral_attributions_referee_user_id_key" ON "referral_attributions"("referee_user_id");
CREATE INDEX "referral_attributions_referrer_user_id_idx" ON "referral_attributions"("referrer_user_id");

ALTER TABLE "referral_attributions" ADD CONSTRAINT "referral_attributions_referee_user_id_fkey" FOREIGN KEY ("referee_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "referral_attributions" ADD CONSTRAINT "referral_attributions_referrer_user_id_fkey" FOREIGN KEY ("referrer_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
