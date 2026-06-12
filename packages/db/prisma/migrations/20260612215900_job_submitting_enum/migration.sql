-- Goal 7 review fix F2 — per-job claim state. A render slice now claims a
-- pending job (pending → submitting) BEFORE calling provider.submit, so two
-- concurrent polls can never both submit (and double-bill) the same job. The
-- claim winner then CASes submitting → submitted, persisting the provider
-- request id.
--
-- OWN migration file on purpose: Postgres forbids using a value added by
-- ALTER TYPE ... ADD VALUE inside the same transaction that added it, so the
-- enum value must be committed before any migration (or code) references it.
ALTER TYPE "generation_job_status" ADD VALUE IF NOT EXISTS 'submitting' BEFORE 'submitted';
