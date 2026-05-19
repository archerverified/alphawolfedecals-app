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

-- ----------------------------------------------------------------------------
-- PII encryption helpers. The key is supplied by the application at call time
-- via the session-scoped GUC `app.pii_key`. Storing the key in the GUC keeps
-- it out of pg_stat_statements and out of CDC replication slot payloads.
-- ----------------------------------------------------------------------------

create or replace function app_encrypt_pii(plaintext text) returns bytea
  language sql
  immutable
  as $$
    select pgp_sym_encrypt(plaintext, current_setting('app.pii_key', false));
  $$;

create or replace function app_decrypt_pii(ciphertext bytea) returns text
  language sql
  immutable
  as $$
    select pgp_sym_decrypt(ciphertext, current_setting('app.pii_key', false));
  $$;

-- Deterministic email lookup hash. HMAC(lower(email), key, 'sha256') so the same
-- email always produces the same bytea — enables a unique index without
-- exposing plaintext to the index.
create or replace function app_email_lookup_hash(email text) returns bytea
  language sql
  immutable
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
