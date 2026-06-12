-- Goal 7 / D7 — credit_source gains 'spend' + 'refund' (generation money rails).
--
-- THIS MIGRATION MUST STAY SEPARATE from 20260612200100_generation_runs:
-- Postgres forbids USING a new enum value inside the same transaction that
-- ADDs it (55P04 "unsafe use of new value of enum type"), and the follow-up
-- migration's CHECK constraint + partial unique indexes reference 'spend' /
-- 'refund'. Two files = two transactions = safe ordering.
ALTER TYPE "credit_source" ADD VALUE 'spend';
ALTER TYPE "credit_source" ADD VALUE 'refund';
