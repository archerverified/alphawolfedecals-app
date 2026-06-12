-- Alpha Wolf Wrap Studio — Phase 1 auth: pgcrypto extension + RLS policies.
-- Apply after `prisma db push` / `prisma migrate deploy`.
-- Idempotent: safe to re-run.
--
-- See ADR-0002. Pattern:
--   * @alphawolf/db wraps every request in a transaction.
--   * Middleware runs `SELECT set_config('app.current_user_id', $1, true)` at txn start.
--   * Policies below read it via current_setting('app.current_user_id', true)::uuid.
--   * The trailing `true` in current_setting() returns NULL when unset, so policies fail closed.
--
-- Caveat: in dev the Supabase pooled connection runs as the `postgres` superuser, which
-- bypasses RLS. The policies still attach; before public launch we must switch
-- DATABASE_URL to a non-superuser role (`app_user`, created below). Tracked as a
-- followup in /activities.md.

create extension if not exists pgcrypto;

-- Application role that respects RLS. Granted only the rights it needs on the
-- tables defined by Prisma. Migrations / superuser ops use a separate connection.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user nologin noinherit nobypassrls;
  end if;
end $$;

grant usage on schema public to app_user;
grant select, insert, update, delete on all tables in schema public to app_user;
grant usage, select on all sequences in schema public to app_user;
alter default privileges in schema public
  grant select, insert, update, delete on tables to app_user;
alter default privileges in schema public
  grant usage, select on sequences to app_user;

-- On Supabase, pgcrypto (pgp_sym_encrypt/decrypt, hmac) lives in the `extensions`
-- schema. The superuser already has it on its search_path; the app_user runtime
-- role needs the same, or the unqualified pgp_sym_* calls in the PII helpers
-- below fail with "function ... does not exist" on the withUser connection
-- (e.g. getOwnUser after sign-in). Grant usage + put it on the role's
-- search_path. Takes effect on new sessions (the connection pool reconnect).
grant usage on schema extensions to app_user;
alter role app_user set search_path = "$user", public, extensions;

-- ----------------------------------------------------------------------------
-- PII encryption helpers. The key is supplied by the application at call time
-- via the session-scoped GUC `app.pii_key`. Storing the key in the GUC keeps
-- it out of pg_stat_statements and out of CDC replication slot payloads.
-- ----------------------------------------------------------------------------

-- `set search_path` is load-bearing: pgcrypto (pgp_sym_*, hmac) lives in the
-- `extensions` schema on Supabase, and the role/session search_path is not
-- reliably carried through the transaction pooler — so without pinning it here,
-- these unqualified calls fail with "function pgp_sym_decrypt(bytea,text) does
-- not exist" on the app_user (withUser) connection. Pinning public + extensions
-- resolves the helpers wherever pgcrypto is installed.
create or replace function app_encrypt_pii(plaintext text) returns bytea
  language sql
  immutable
  set search_path = public, extensions, pg_temp
  as $$
    select pgp_sym_encrypt(plaintext, current_setting('app.pii_key', false));
  $$;

create or replace function app_decrypt_pii(ciphertext bytea) returns text
  language sql
  immutable
  set search_path = public, extensions, pg_temp
  as $$
    select pgp_sym_decrypt(ciphertext, current_setting('app.pii_key', false));
  $$;

-- Deterministic email lookup hash. HMAC(lower(email), key, 'sha256') so the same
-- email always produces the same bytea — enables a unique index without
-- exposing plaintext to the index.
create or replace function app_email_lookup_hash(email text) returns bytea
  language sql
  immutable
  set search_path = public, extensions, pg_temp
  as $$
    select hmac(lower(email), current_setting('app.pii_key', false), 'sha256');
  $$;

-- ----------------------------------------------------------------------------
-- RLS policies. Each user-owned table:
--   * `enable row level security`
--   * a SELECT/UPDATE policy that requires app.current_user_id = row owner
--   * INSERT is policy-controlled too, so writes also need a session user
--
-- account_type permanence is enforced via a trigger (see bottom of file) so it
-- holds even for the postgres role.
-- ----------------------------------------------------------------------------

-- users: a user can read/update their own row only.
alter table users enable row level security;
alter table users force row level security;

drop policy if exists users_self_select on users;
create policy users_self_select on users
  for select
  using (id = nullif(current_setting('app.current_user_id', true), '')::uuid);

drop policy if exists users_self_update on users;
create policy users_self_update on users
  for update
  using (id = nullif(current_setting('app.current_user_id', true), '')::uuid)
  with check (id = nullif(current_setting('app.current_user_id', true), '')::uuid);

-- No INSERT/DELETE policy: signup and account deletion run as the system role
-- (BYPASSRLS) since they happen before/after a user is authenticated.

-- SECURITY DEFINER membership check. Mirrors app_is_admin: it discloses only a
-- boolean about the CURRENT session user (the app.current_user_id GUC), so a
-- caller passing an arbitrary p_shop_id only learns whether THEY belong to it —
-- never another tenant's membership. Being SECURITY DEFINER lets it read
-- `memberships` WITHOUT re-entering memberships RLS, which is what breaks the
-- infinite recursion a self-referential memberships policy caused (any read of a
-- shop-routed order under app_user evaluated orders_shop_read -> EXISTS(memberships)
-- -> memberships_member_select -> EXISTS(memberships) -> ... => 42P17). search_path
-- is pinned per the SECURITY DEFINER hardening guideline. Fails closed: returns
-- false when app.current_user_id is unset.
--
-- DEFINED HERE, ABOVE its first callers (the shops + memberships policies below):
-- Postgres resolves a policy's function references at CREATE POLICY time, so a
-- clean `db:apply-sql` (new dev / CI integration DB / DR rebuild) needs the
-- function to already exist when those policies are created.
create or replace function app_is_shop_member(p_shop_id uuid) returns boolean
  language sql
  stable
  security definer
  set search_path = public, pg_temp
  as $$
    select exists (
      select 1 from memberships m
      where m.shop_id = p_shop_id
        and m.user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    );
  $$;

-- Lock down EXECUTE: this SECURITY DEFINER helper is only invoked inside RLS
-- policies (evaluated as app_user, or the superuser bootstrap path which bypasses
-- permission checks), so anon/authenticated must NOT call it via the PostgREST
-- data API (Supabase linter 0028/0029). Revoke the default PUBLIC grant and grant
-- EXECUTE to app_user only. Guarded on role existence so a fresh local DB (no
-- Supabase roles) still applies.
revoke all on function app_is_shop_member(uuid) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function app_is_shop_member(uuid) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function app_is_shop_member(uuid) from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'app_user') then
    execute 'grant execute on function app_is_shop_member(uuid) to app_user';
  end if;
end $$;

-- shops: a user can read a shop if they are a member.
alter table shops enable row level security;
alter table shops force row level security;

drop policy if exists shops_member_select on shops;
create policy shops_member_select on shops
  for select
  using (
    app_is_shop_member(shops.id)
  );

drop policy if exists shops_admin_update on shops;
create policy shops_admin_update on shops
  for update
  using (
    exists (
      select 1 from memberships m
      where m.shop_id = shops.id
        and m.user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
        and m.role = 'shop_admin'
    )
  );

-- memberships: a user sees rows for shops they belong to.
alter table memberships enable row level security;
alter table memberships force row level security;

drop policy if exists memberships_member_select on memberships;
create policy memberships_member_select on memberships
  for select
  using (
    user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    or app_is_shop_member(memberships.shop_id)
  );

-- otp_codes: a user can read/update their own codes only.
alter table otp_codes enable row level security;
alter table otp_codes force row level security;

drop policy if exists otp_self_select on otp_codes;
create policy otp_self_select on otp_codes
  for select
  using (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid);

drop policy if exists otp_self_update on otp_codes;
create policy otp_self_update on otp_codes
  for update
  using (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid)
  with check (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid);

-- auth_events: a user can read their own audit log. Writes happen as the system role.
alter table auth_events enable row level security;
alter table auth_events force row level security;

drop policy if exists auth_events_self_select on auth_events;
create policy auth_events_self_select on auth_events
  for select
  using (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid);

-- rate_limits has no user-scoping; it's a global, server-managed table. RLS off.
-- Still locked down via grants: only app_user can read/write.
alter table rate_limits disable row level security;

-- ----------------------------------------------------------------------------
-- account_type is permanent. Enforce with a trigger that rejects any UPDATE
-- that changes the column. Acts even for superuser (unlike RLS).
-- ----------------------------------------------------------------------------

create or replace function users_block_account_type_change() returns trigger
  language plpgsql
  as $$
  begin
    if new.account_type is distinct from old.account_type then
      raise exception 'account_type is permanent and cannot be changed (was %, attempted %)',
        old.account_type, new.account_type
        using errcode = 'check_violation';
    end if;
    return new;
  end;
  $$;

drop trigger if exists users_account_type_permanent on users;
create trigger users_account_type_permanent
  before update on users
  for each row
  execute function users_block_account_type_change();

-- plan (Goal 5 / B2C-001) is system-managed: users_self_update is column-blind,
-- so without this guard a hand-crafted UPDATE on the withUser connection could
-- self-escalate plan the day a paid value joins the user_plan enum. Today the
-- enum has one value (inert), but the guard ships WITH the column so the
-- invariant never depends on "the enum happens to be single-valued". Unlike
-- account_type (permanent for everyone), plan changes ARE allowed for the
-- system role: app.current_user_id is set only on withUser sessions, so an
-- unset/empty GUC means a trusted system write (Stripe webhook in Phase 2).
-- search_path pinned: keeps name resolution out of caller control (and keeps
-- the Supabase function_search_path_mutable advisor quiet).
create or replace function users_block_plan_change() returns trigger
  language plpgsql
  set search_path = public, pg_temp
  as $$
  begin
    if new.plan is distinct from old.plan
       and nullif(current_setting('app.current_user_id', true), '') is not null then
      raise exception 'plan is system-managed and cannot be changed by the user'
        using errcode = 'check_violation';
    end if;
    return new;
  end;
  $$;

drop trigger if exists users_plan_system_managed on users;
create trigger users_plan_system_managed
  before update on users
  for each row
  execute function users_block_plan_change();

-- ----------------------------------------------------------------------------
-- Vehicle template library RLS (GH-003 / GH-004 / GH-017). See ADR-0005.
--
-- Vehicle templates are SHARED, PUBLIC, NON-PII catalog data — not tenant rows.
-- The model is therefore different from the user-owned tables above:
--   * vehicles / vehicle_panels: any authenticated user reads `published` rows;
--     writes are admin-only.
--   * vehicle_template_requests: a requester sees their own rows; admins see all
--     and own the status transitions.
--
-- "Admin" is users.is_admin (a flag distinct from the permanent account_type;
-- see ADR-0005). app_is_admin() reads it for the current session user.
--
-- Note on the read path: the public browse runs through withSystem() (the
-- superuser connection, which BYPASSES RLS), so the published-only filter for
-- the catalog lives in the repo query, NOT in RLS. The SELECT policy below is
-- the enforcement boundary for the authenticated (withUser → app_user) path and
-- is what the RLS integration test exercises.
-- ----------------------------------------------------------------------------

-- SECURITY DEFINER so it can read users.is_admin regardless of the users RLS
-- policies (it only ever discloses a boolean about the current session user).
-- search_path is pinned per the SECURITY DEFINER hardening guideline. Fails
-- closed: returns false when app.current_user_id is unset.
create or replace function app_is_admin() returns boolean
  language sql
  stable
  security definer
  set search_path = public, pg_temp
  as $$
    select coalesce(
      (select is_admin from users
        where id = nullif(current_setting('app.current_user_id', true), '')::uuid),
      false);
  $$;

-- Lock down EXECUTE on app_is_admin (same rationale as app_is_shop_member, which
-- is defined + locked down above the shops block): anon/authenticated must not be
-- able to call it via the PostgREST data API (Supabase linter 0028/0029). Revoke
-- the default PUBLIC grant and grant EXECUTE to app_user only. Guarded on role
-- existence so a fresh local DB (no Supabase roles) still applies.
revoke all on function app_is_admin() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function app_is_admin() from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function app_is_admin() from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'app_user') then
    execute 'grant execute on function app_is_admin() to app_user';
  end if;
end $$;

-- vehicles -------------------------------------------------------------------
alter table vehicles enable row level security;
alter table vehicles force row level security;

drop policy if exists vehicles_public_read on vehicles;
create policy vehicles_public_read on vehicles
  for select
  using (status = 'published' or app_is_admin());

drop policy if exists vehicles_admin_insert on vehicles;
create policy vehicles_admin_insert on vehicles
  for insert
  with check (app_is_admin());

drop policy if exists vehicles_admin_update on vehicles;
create policy vehicles_admin_update on vehicles
  for update
  using (app_is_admin())
  with check (app_is_admin());

drop policy if exists vehicles_admin_delete on vehicles;
create policy vehicles_admin_delete on vehicles
  for delete
  using (app_is_admin());

-- vehicle_panels -------------------------------------------------------------
-- Panel visibility tracks its parent vehicle's published state; writes admin-only.
alter table vehicle_panels enable row level security;
alter table vehicle_panels force row level security;

drop policy if exists vehicle_panels_public_read on vehicle_panels;
create policy vehicle_panels_public_read on vehicle_panels
  for select
  using (
    app_is_admin()
    or exists (
      select 1 from vehicles v
      where v.id = vehicle_panels.vehicle_id
        and v.status = 'published'
    )
  );

drop policy if exists vehicle_panels_admin_insert on vehicle_panels;
create policy vehicle_panels_admin_insert on vehicle_panels
  for insert
  with check (app_is_admin());

drop policy if exists vehicle_panels_admin_update on vehicle_panels;
create policy vehicle_panels_admin_update on vehicle_panels
  for update
  using (app_is_admin())
  with check (app_is_admin());

drop policy if exists vehicle_panels_admin_delete on vehicle_panels;
create policy vehicle_panels_admin_delete on vehicle_panels
  for delete
  using (app_is_admin());

-- vehicle_template_requests --------------------------------------------------
alter table vehicle_template_requests enable row level security;
alter table vehicle_template_requests force row level security;

drop policy if exists vtr_owner_or_admin_select on vehicle_template_requests;
create policy vtr_owner_or_admin_select on vehicle_template_requests
  for select
  using (
    requester_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    or app_is_admin()
  );

-- A signed-in user may only file a request as themselves.
drop policy if exists vtr_owner_insert on vehicle_template_requests;
create policy vtr_owner_insert on vehicle_template_requests
  for insert
  with check (
    requester_id = nullif(current_setting('app.current_user_id', true), '')::uuid
  );

-- Status transitions (pending -> in_progress -> shipped/rejected) are admin-only.
drop policy if exists vtr_admin_update on vehicle_template_requests;
create policy vtr_admin_update on vehicle_template_requests
  for update
  using (app_is_admin())
  with check (app_is_admin());

drop policy if exists vtr_admin_delete on vehicle_template_requests;
create policy vtr_admin_delete on vehicle_template_requests
  for delete
  using (app_is_admin());

-- template_sources (Goal 6 Template Studio) ----------------------------------
-- Studio ingest provenance: which owned source artifact (photo / OEM PDF /
-- owned SVG) each authored template traces to. Internal-staff data only —
-- admins author templates; customers never read or write these rows. One
-- FOR ALL admin policy covers every verb and fails closed (app_is_admin() is
-- false when app.current_user_id is unset — ADR-0014 invariant 5).
alter table template_sources enable row level security;
alter table template_sources force row level security;

drop policy if exists template_sources_admin_all on template_sources;
create policy template_sources_admin_all on template_sources
  for all
  using (app_is_admin())
  with check (app_is_admin());

-- ----------------------------------------------------------------------------
-- Customer projects + canvas persistence + uploaded assets (GH-005 / GH-008).
-- See ADR-0006 (canvas model) and ADR-0007 (asset storage).
--
-- These are TENANT rows owned by a single user (unlike the shared vehicle
-- catalog above). They scope by app.current_user_id, mirroring the auth tables:
--   * projects: owner_user_id = current session user (FOR ALL — read/write/delete).
--     Soft-delete (status='deleted') is a normal UPDATE the owner performs; the
--     SELECT side intentionally still returns deleted rows so the 30-day recovery
--     window works (the repo filters them out of the default list).
--   * project_versions / project_assets: no owner column of their own — they
--     scope via an EXISTS on the parent project's owner (the vehicle_panels
--     pattern). canvas_state / uploaded bytes are never visible cross-tenant.
--
-- The Supabase superuser-bypass caveat documented at the top of this file applies
-- equally here: enforcement is real only on the app_user (withUser) connection,
-- which the RLS integration test exercises.
--
-- New tables created by the latest migration also need table-level grants for
-- app_user; the `grant ... on all tables in schema public` re-run at the top of
-- this (idempotent) file covers them on every db:apply-sql.
-- ----------------------------------------------------------------------------

-- projects -------------------------------------------------------------------
alter table projects enable row level security;
alter table projects force row level security;

drop policy if exists projects_owner_all on projects;
create policy projects_owner_all on projects
  for all
  using (owner_user_id = nullif(current_setting('app.current_user_id', true), '')::uuid)
  with check (owner_user_id = nullif(current_setting('app.current_user_id', true), '')::uuid);

-- project_versions -----------------------------------------------------------
alter table project_versions enable row level security;
alter table project_versions force row level security;

drop policy if exists project_versions_owner_all on project_versions;
create policy project_versions_owner_all on project_versions
  for all
  using (
    exists (
      select 1 from projects p
      where p.id = project_versions.project_id
        and p.owner_user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
  )
  with check (
    exists (
      select 1 from projects p
      where p.id = project_versions.project_id
        and p.owner_user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
  );

-- project_assets -------------------------------------------------------------
alter table project_assets enable row level security;
alter table project_assets force row level security;

drop policy if exists project_assets_owner_all on project_assets;
create policy project_assets_owner_all on project_assets
  for all
  using (
    exists (
      select 1 from projects p
      where p.id = project_assets.project_id
        and p.owner_user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
  )
  with check (
    exists (
      select 1 from projects p
      where p.id = project_assets.project_id
        and p.owner_user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
  );

-- orders ---------------------------------------------------------------------
-- Production orders (Goal 3a PR5). The customer owns their own orders (owner_user_id
-- = session user) for the full lifecycle (orders_owner_all, FOR ALL). Two further
-- policies serve the shop dashboard (Goal 3b):
--   * orders_shop_read   (PR1) — a member of the routing shop may READ the order.
--   * orders_shop_update (PR3) — a member of the routing shop may UPDATE it
--                                (the status-transition workflow).
--
-- RLS permissive policies are OR'd per command, so these add shop access WITHOUT
-- weakening orders_owner_all: an UPDATE is allowed iff the session user owns the
-- row OR is a member of its routing shop. A user who is neither sees nothing and
-- can write nothing.
alter table orders enable row level security;
alter table orders force row level security;

drop policy if exists orders_owner_all on orders;
create policy orders_owner_all on orders
  for all
  using (owner_user_id = nullif(current_setting('app.current_user_id', true), '')::uuid)
  with check (owner_user_id = nullif(current_setting('app.current_user_id', true), '')::uuid);

drop policy if exists orders_shop_read on orders;
create policy orders_shop_read on orders
  for select
  using (
    owner_shop_id is not null
    and app_is_shop_member(orders.owner_shop_id)
  );

-- Shop members transition the status of orders routed to their shop. USING gates
-- which EXISTING rows are updatable (only the caller's shop's orders — a cross-shop
-- UPDATE matches zero rows). WITH CHECK gates the POST-update row, so a member
-- cannot re-route an order to a shop they don't belong to. owner_shop_id is never
-- changed by the app's transition path (status only); the WITH CHECK is
-- defence-in-depth against a hand-crafted UPDATE on the app_user connection.
drop policy if exists orders_shop_update on orders;
create policy orders_shop_update on orders
  for update
  using (
    owner_shop_id is not null
    and app_is_shop_member(orders.owner_shop_id)
  )
  with check (
    owner_shop_id is not null
    and app_is_shop_member(orders.owner_shop_id)
  );

-- credit_ledger -----------------------------------------------------------------
-- Append-only credit ledger (Goal 5 / B2C-001). Balance = SUM(delta) per user.
-- Write model: ONLY the system connection writes rows (signup grant at OTP
-- activation today; Stripe webhook `purchase` rows in Phase 2). The blanket
-- table GRANT at the top of this file gives app_user INSERT/UPDATE/DELETE at
-- the table-ACL layer, so two defenses below:
--   1. RLS (enable + FORCE) with a SELECT-only owner policy and NO write
--      policies — a hand-crafted INSERT on the withUser connection fails
--      closed (users cannot mint themselves credits).
--   2. Belt-and-braces: the write grants are explicitly revoked for this table.
-- Asserted by packages/db/tests/credits-rls.integration.test.ts.
alter table credit_ledger enable row level security;
alter table credit_ledger force row level security;

-- ORDER MATTERS: this revoke must stay BELOW the blanket table grant at the top
-- of the file -- each idempotent re-run re-grants there, then strips here. (RLS
-- alone already blocks writes; the revoke is defense-in-depth.)
revoke insert, update, delete on credit_ledger from app_user;

drop policy if exists credit_ledger_owner_read on credit_ledger;
create policy credit_ledger_owner_read on credit_ledger
  for select
  using (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid);

-- design_briefs + brief_snapshots ---------------------------------------------
-- Guided-design brief (Goal 5 / B2C-002). Customers fully own their brief: the
-- wizard reads, autosaves, and snapshots it on the withUser connection, so
-- unlike credit_ledger these tables carry owner WRITE policies. Ownership is
-- anchored on the parent project (same pattern as project_assets) — a brief for
-- a project you don't own is invisible and unwritable, and the WITH CHECK stops
-- re-pointing a brief at someone else's project. owner_user_id is denormalized
-- for indexing; the project join is the authz truth.
alter table design_briefs enable row level security;
alter table design_briefs force row level security;

drop policy if exists design_briefs_owner_all on design_briefs;
create policy design_briefs_owner_all on design_briefs
  for all
  using (
    exists (
      select 1 from projects p
      where p.id = design_briefs.project_id
        and p.owner_user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
  )
  with check (
    owner_user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    and exists (
      select 1 from projects p
      where p.id = design_briefs.project_id
        and p.owner_user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
  );

alter table brief_snapshots enable row level security;
alter table brief_snapshots force row level security;

-- Snapshots are append-only by design: INSERT + SELECT for the brief owner, no
-- UPDATE/DELETE policy — a saved brief version can never be silently rewritten.
drop policy if exists brief_snapshots_owner_read on brief_snapshots;
create policy brief_snapshots_owner_read on brief_snapshots
  for select
  using (
    exists (
      select 1 from design_briefs b
      join projects p on p.id = b.project_id
      where b.id = brief_snapshots.brief_id
        and p.owner_user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
  );

drop policy if exists brief_snapshots_owner_insert on brief_snapshots;
create policy brief_snapshots_owner_insert on brief_snapshots
  for insert
  with check (
    exists (
      select 1 from design_briefs b
      join projects p on p.id = b.project_id
      where b.id = brief_snapshots.brief_id
        and p.owner_user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
  );

revoke update, delete on brief_snapshots from app_user;

-- ----------------------------------------------------------------------------
-- AI generation pipeline (Goal 7 / D4 + D7). See docs/product/
-- goal-7-pipeline-design.md (backend-architect review items 2/3/7).
--
-- Money rails first: credit_ledger keeps its REVOKE INSERT/UPDATE/DELETE from
-- app_user (above), so generation spends/refunds can ONLY happen through the
-- SECURITY DEFINER functions below — the withUser connection cannot mint,
-- rewrite, or erase ledger rows, and the partial unique indexes
-- (credit_ledger_spend_once_per_run / credit_ledger_refund_once_per_run,
-- 20260612200100 migration) make double-spend impossible and refunds
-- idempotent at the schema layer.
--
-- The functions follow the app_is_shop_member shape exactly: SECURITY DEFINER,
-- search_path pinned, the user identity derived from the app.current_user_id
-- GUC (NEVER a parameter — a caller can't act as someone else), fail closed
-- when the GUC is unset, EXECUTE revoked from public/anon/authenticated and
-- granted to app_user only. Defined ABOVE their first use, per the
-- app_is_shop_member ordering note.
-- ----------------------------------------------------------------------------

-- Atomically spend p_amount credits against a generation run owned by the
-- session user. Serialized per user via a transaction-scoped advisory lock
-- (xact-scoped ONLY — pgBouncer transaction pooling forbids session locks), so
-- the balance check + insert can't race a concurrent spend into a negative
-- balance. Raises:
--   * 'no session user'        — GUC unset (fail closed; never a system path).
--   * 'amount must be positive'.
--   * 'run not found for session user' — p_run_id missing or owned by someone else.
--   * 'insufficient_credits'   — balance < p_amount (repo maps this to a typed
--                                result; the caller's transaction rolls back,
--                                taking the run INSERT with it).
--   * unique_violation on credit_ledger_spend_once_per_run — a second spend
--     for the same run; deliberately NOT caught (double-spend must surface).
-- Returns the post-spend balance.
create or replace function app_spend_credits(p_run_id uuid, p_amount int, p_reason text) returns int
  language plpgsql
  security definer
  set search_path = public, pg_temp
  as $$
  declare
    v_user uuid;
    v_balance int;
  begin
    v_user := nullif(current_setting('app.current_user_id', true), '')::uuid;
    if v_user is null then
      raise exception 'app_spend_credits: no session user';
    end if;
    if p_amount is null or p_amount <= 0 then
      raise exception 'app_spend_credits: amount must be positive (got %)', p_amount;
    end if;

    -- Per-user serialization: balance check + insert are atomic vs any other
    -- spend by the same user. Two-int form: (namespace, user). Released at
    -- transaction end automatically.
    perform pg_advisory_xact_lock(hashtext('credit_spend'), hashtext(v_user::text));

    if not exists (
      select 1 from generation_runs r
      where r.id = p_run_id and r.user_id = v_user
    ) then
      raise exception 'app_spend_credits: run not found for session user';
    end if;

    select coalesce(sum(delta), 0) into v_balance
      from credit_ledger
      where user_id = v_user;
    if v_balance < p_amount then
      raise exception 'insufficient_credits';
    end if;

    insert into credit_ledger (user_id, delta, source, reason, run_id)
    values (v_user, -p_amount, 'spend', p_reason, p_run_id);

    return v_balance - p_amount;
  end;
  $$;

revoke all on function app_spend_credits(uuid, int, text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function app_spend_credits(uuid, int, text) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function app_spend_credits(uuid, int, text) from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'app_user') then
    execute 'grant execute on function app_spend_credits(uuid, int, text) to app_user';
  end if;
end $$;

-- Compensate a run's spend. Idempotent BY CONSTRUCTION: the INSERT targets the
-- credit_ledger_refund_once_per_run partial unique with ON CONFLICT DO NOTHING,
-- so the advance path and the sweeper can both call it safely — exactly one
-- refund row ever lands. The refunded user is derived FROM THE SPEND ROW, never
-- a parameter: that lets the system sweeper (withSystem — no GUC) refund on the
-- owner's behalf without ever choosing the beneficiary. When a session user IS
-- present (withUser), the spend must belong to them — a customer cannot trigger
-- another tenant's refund. Returns true iff a refund row was inserted.
create or replace function app_refund_credits(p_run_id uuid) returns boolean
  language plpgsql
  security definer
  set search_path = public, pg_temp
  as $$
  declare
    v_session uuid;
    v_spend record;
    v_count int;
  begin
    v_session := nullif(current_setting('app.current_user_id', true), '')::uuid;

    select user_id, delta, reason into v_spend
      from credit_ledger
      where run_id = p_run_id and source = 'spend';
    if not found then
      return false; -- nothing was spent (e.g. a free 'final' run): nothing to refund
    end if;

    if v_session is not null and v_spend.user_id <> v_session then
      raise exception 'app_refund_credits: spend row does not belong to session user';
    end if;

    insert into credit_ledger (user_id, delta, source, reason, run_id)
    values (v_spend.user_id, -v_spend.delta, 'refund',
            coalesce(v_spend.reason, 'spend') || '_refund', p_run_id)
    on conflict (run_id) where source = 'refund' do nothing;

    get diagnostics v_count = row_count;
    return v_count > 0;
  end;
  $$;

revoke all on function app_refund_credits(uuid) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function app_refund_credits(uuid) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function app_refund_credits(uuid) from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'app_user') then
    execute 'grant execute on function app_refund_credits(uuid) to app_user';
  end if;
end $$;

-- Today's GLOBAL generation spend (UTC day), for the daily spend cap (D7).
-- SECURITY DEFINER on purpose: the cap is across ALL users, and app_user's
-- RLS view of generation_runs is owner-scoped — without definer the sum would
-- silently only cover the caller's own runs. Discloses a single aggregate
-- number, no per-row data.
create or replace function app_generation_spend_today() returns numeric
  language sql
  stable
  security definer
  set search_path = public, pg_temp
  as $$
    select coalesce(sum(cost_usd), 0)
    from generation_runs
    where created_at >= date_trunc('day', now() at time zone 'utc');
  $$;

revoke all on function app_generation_spend_today() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function app_generation_spend_today() from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function app_generation_spend_today() from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'app_user') then
    execute 'grant execute on function app_generation_spend_today() to app_user';
  end if;
end $$;

-- generation_runs --------------------------------------------------------------
-- The run state machine. Owner-scoped SELECT/INSERT/UPDATE; NO DELETE policy and
-- the grant is revoked — runs are audit records (cost provenance), even for
-- their owner. INSERT WITH CHECK verifies BOTH the row's user_id is the session
-- user AND the session user owns the target project (design_briefs_owner_all
-- shape) — a guessed foreign projectId plants nothing.
alter table generation_runs enable row level security;
alter table generation_runs force row level security;

revoke delete on generation_runs from app_user;

drop policy if exists generation_runs_owner_select on generation_runs;
create policy generation_runs_owner_select on generation_runs
  for select
  using (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid);

drop policy if exists generation_runs_owner_insert on generation_runs;
create policy generation_runs_owner_insert on generation_runs
  for insert
  with check (
    user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    and exists (
      select 1 from projects p
      where p.id = generation_runs.project_id
        and p.owner_user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
  );

-- UPDATE drives the CAS status transitions (advance/fail/true-up). WITH CHECK
-- repeats the insert predicate so an update can't re-point a run at a foreign
-- project or another user.
drop policy if exists generation_runs_owner_update on generation_runs;
create policy generation_runs_owner_update on generation_runs
  for update
  using (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid)
  with check (
    user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    and exists (
      select 1 from projects p
      where p.id = generation_runs.project_id
        and p.owner_user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
  );

-- generation_jobs ---------------------------------------------------------------
-- Mutable work-unit state, scoped through the parent run's owner (the
-- project_versions EXISTS pattern). DELETE revoked: job rows carry the
-- provider_request_id resubmit guard and per-job cost provenance.
alter table generation_jobs enable row level security;
alter table generation_jobs force row level security;

revoke delete on generation_jobs from app_user;

drop policy if exists generation_jobs_owner_all on generation_jobs;
create policy generation_jobs_owner_all on generation_jobs
  for all
  using (
    exists (
      select 1 from generation_runs r
      where r.id = generation_jobs.run_id
        and r.user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
  )
  with check (
    exists (
      select 1 from generation_runs r
      where r.id = generation_jobs.run_id
        and r.user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
  );

-- generation_images ---------------------------------------------------------------
-- IMMUTABLE results + provenance (brief_snapshots shape): SELECT + INSERT for
-- the run owner, no UPDATE/DELETE policy AND the grants revoked — a generated
-- image's provenance can never be rewritten, even by its owner.
alter table generation_images enable row level security;
alter table generation_images force row level security;

revoke update, delete on generation_images from app_user;

drop policy if exists generation_images_owner_read on generation_images;
create policy generation_images_owner_read on generation_images
  for select
  using (
    exists (
      select 1 from generation_runs r
      where r.id = generation_images.run_id
        and r.user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
  );

drop policy if exists generation_images_owner_insert on generation_images;
create policy generation_images_owner_insert on generation_images
  for insert
  with check (
    exists (
      select 1 from generation_runs r
      where r.id = generation_images.run_id
        and r.user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
  );
