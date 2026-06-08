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

-- shops: a user can read a shop if they are a member.
alter table shops enable row level security;
alter table shops force row level security;

drop policy if exists shops_member_select on shops;
create policy shops_member_select on shops
  for select
  using (
    exists (
      select 1 from memberships m
      where m.shop_id = shops.id
        and m.user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
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
    or exists (
      select 1 from memberships m2
      where m2.shop_id = memberships.shop_id
        and m2.user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
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
    and exists (
      select 1 from memberships m
      where m.shop_id = orders.owner_shop_id
        and m.user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
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
    and exists (
      select 1 from memberships m
      where m.shop_id = orders.owner_shop_id
        and m.user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
  )
  with check (
    owner_shop_id is not null
    and exists (
      select 1 from memberships m
      where m.shop_id = orders.owner_shop_id
        and m.user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
  );
