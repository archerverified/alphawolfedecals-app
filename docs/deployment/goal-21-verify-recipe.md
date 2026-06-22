# Goal 21 - Real-fal Verification Recipe (photo-render path)

This is the manual D5 verification recipe for the photo path. It does not run in CI.
The durable E2E spec (`apps/web/e2e/goal-21-photo-render.spec.ts`) runs against the
mock provider in CI; this recipe runs it against the real fal provider on a throwaway
local database so the live production DB is never written.

Adapted from the Goal 13/16/20 recipes. Run once after all PRs are merged, before the
prod deploy step.

---

## Spend cap

Hard cap for this verification = **$10** (same precedent as Goals 7/13/20, which each
landed under $1.20). The in-code global rail `AI_CONFIG.dailySpendCapUsd = 5` also
bounds every run. One full photo-path e2e estimate = **~$0.85** ($0.78 from Goal 20
signed-in run + ~$0.117 for 3 nano photo renders on initial + ~$0.039 for 1 on final).

---

## Step 1: Create the throwaway local Postgres

```bash
createdb alphawolf_e2e_g21
psql alphawolf_e2e_g21 <<'SQL'
  CREATE SCHEMA IF NOT EXISTS extensions;
  CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

  -- RLS enforcement role (must match app_user in the schema migrations).
  DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
      CREATE ROLE app_user LOGIN NOBYPASSRLS;
    END IF;
  END
  $$;
SQL
```

This creates the `extensions` schema and `pgcrypto` there (the migrations reference
`extensions.gen_random_uuid()` and `extensions.pgcrypto`). The `app_user` role must
be a LOGIN so Prisma can authenticate with it; `NOBYPASSRLS` is required so RLS
policies are enforced for all `withUser` calls.

---

## Step 2: Point packages/db at the throwaway DB

Edit `packages/db/.env` (or `.env.local` if that file takes precedence in your setup):

```ini
DATABASE_URL="postgresql://postgres@localhost/alphawolf_e2e_g21?schema=public"
DATABASE_URL_APP="postgresql://app_user@localhost/alphawolf_e2e_g21?schema=public"
DIRECT_URL="postgresql://postgres@localhost/alphawolf_e2e_g21?schema=public"
```

The `app_user` password defaults to no password on a local Postgres with `trust` auth.
Adjust for your local `pg_hba.conf` if needed.

---

## Step 3: Run all migrations on the throwaway DB

```bash
pnpm --filter @alphawolf/db prisma:migrate:deploy
```

This runs all migrations in `packages/db/prisma/migrations/` in order, including the
Goal 21 `render_target` discriminator migration. No shadow DB is used; the throwaway DB
IS the target.

Then apply the auth RLS bootstrap SQL (which Prisma migrations deliberately skip because
it uses `auth` schema DDL that only Supabase runs):

```bash
pnpm --filter @alphawolf/db db:apply-sql
```

Confirm the tables exist and `app_user` can connect:

```bash
psql alphawolf_e2e_g21 -c "\dt"
psql "postgresql://app_user@localhost/alphawolf_e2e_g21" -c "SELECT current_user;"
```

---

## Step 4: Copy the catalogue read-only from prod

The vehicle catalogue (`vehicles` + `vehicle_panels`) is seeded from production. Never
write to it here; only read it.

Copy BOTH vehicles so either verification path works:

- `a0000000-0000-4000-8000-000000000001` is the **Ford Transit 250** (`SEEDED_VEHICLE_ID`,
  used by the automated mock spec `apps/web/e2e/goal-21-photo-render.spec.ts`). Boxes-only
  art, fine for the mock path.
- `aa000001-0000-4000-8000-000000000001` is the **2024 BMW X3** (recognizable AW-owned
  `wrapped.svg` art). Use this one for the MANUAL real-fal walkthrough so the on-photo
  render and the multi-view showcase have rich, recognizable vehicle art.

Connect to the live DB using `DIRECT_URL` (the Supabase direct connection string from
your `apps/web/.env.local` or the memory note `supabase-env-topology.md`):

```bash
# Export from live (replace <DIRECT_URL> with the real value). Both vehicles.
psql "<DIRECT_URL>" <<'SQL'
  SET session_replication_role = replica;  -- bypass triggers for the export
  COPY (
    SELECT * FROM vehicles WHERE id IN (
      'a0000000-0000-4000-8000-000000000001',
      'aa000001-0000-4000-8000-000000000001'
    )
  ) TO '/tmp/g21_vehicles.csv' WITH CSV HEADER;
  COPY (
    SELECT * FROM vehicle_panels WHERE vehicle_id IN (
      'a0000000-0000-4000-8000-000000000001',
      'aa000001-0000-4000-8000-000000000001'
    )
  ) TO '/tmp/g21_vehicle_panels.csv' WITH CSV HEADER;
SQL

# Import into the throwaway DB.
psql alphawolf_e2e_g21 <<'SQL'
  SET session_replication_role = replica;
  COPY vehicles FROM '/tmp/g21_vehicles.csv' WITH CSV HEADER;
  COPY vehicle_panels FROM '/tmp/g21_vehicle_panels.csv' WITH CSV HEADER;
SQL
```

Note: `session_replication_role = replica` disables foreign-key and trigger checks
during the copy, which is needed because the local DB does not have the Supabase `auth`
schema rows that some FK constraints reference. This matches the Goal 13/16 recipe.

Verify both rows landed (Ford Transit + BMW X3):

```bash
psql alphawolf_e2e_g21 -c \
  "SELECT id, make, model FROM vehicles WHERE id IN ('a0000000-0000-4000-8000-000000000001','aa000001-0000-4000-8000-000000000001');"
```

For the manual real-fal walkthrough, navigate to `/vehicles/aa000001-0000-4000-8000-000000000001`
(the X3). For the automated mock spec, no manual navigation is needed (it targets the Transit).

---

## Step 5: Configure apps/web to use the throwaway DB and real fal

Edit `apps/web/.env.local`:

```ini
# Throwaway local DB (see Step 2).
DATABASE_URL="postgresql://postgres@localhost/alphawolf_e2e_g21?schema=public"
DATABASE_URL_APP="postgresql://app_user@localhost/alphawolf_e2e_g21?schema=public"
DIRECT_URL="postgresql://postgres@localhost/alphawolf_e2e_g21?schema=public"

# Real fal provider (overrides the mock default).
AI_PROVIDER=fal
FAL_KEY=<your FAL_KEY from the live .env.local or Vercel env>

# Keep the Anthropic key so the orchestrator (Haiku) works.
# ANTHROPIC_API_KEY is already in your live .env.local - leave it unchanged.

# Blank telemetry so no prod events fire during the local run.
NEXT_PUBLIC_POSTHOG_KEY=
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=

# Live storage is used for vehicle-templates (read-only art) and project-assets
# (the run's generated images). Keep the Supabase URL and anon key as-is so
# storage reads/writes go to the live project-assets bucket (scoped to throwaway
# project IDs; purged in Step 8).
NEXT_PUBLIC_SUPABASE_URL=<your live value>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your live value>
```

The FAL_KEY is write-only in Vercel (pulling returns blank); get it from your local
`apps/web/.env.local` (it was set during Goal 16 - see memory note
`goal-16-launch-readiness-state.md`).

---

## Step 6: Build the packages and start the dev server

```bash
pnpm install
turbo run build --filter='./packages/*'
```

Then in a separate terminal (or background):

```bash
cd apps/web && pnpm dev
# Wait for "Ready in Xms" before running the spec.
```

---

## Step 7: Run the photo-path E2E spec against real fal

```bash
cd apps/web
pnpm exec playwright test e2e/goal-21-photo-render.spec.ts --headed
```

The spec uses `AI_PROVIDER=fal` (set in `.env.local`), so every fal call is real.
Budget reminder: one full run is ~$0.85; stay under the $10 hard cap.

**What to manually verify on the run:**

1. After Generate, 3 concept cards appear AND each card shows a photo-preview image
   (`data-testid="photo-concept-<key>"`). This is the on-photo i2i render from
   `nano_banana_edit`.
2. After selecting the winning concept and the free final completes, the "See it across
   your vehicle" button appears for that concept.
3. Clicking the showcase button opens the modal and a composite image renders
   (`data-testid="showcase-image"`). The composite includes the on-photo hero at the
   top and the coherent template-view renders beneath.
4. The downloaded PDF (`/projects/<id>/export`) is a valid spec pack. Open it manually
   and verify: (a) it contains template-geometry-derived view pages, (b) no page is
   labeled "photo" or shows the raw customer photo as the print render. This is the
   print-path-is-locked invariant from the plan (D-E/D-F).

Screenshots land in `/tmp/goal21-e2e/`.

---

## Step 8: Net-zero purge (storage only)

The throwaway DB holds all project rows. The live `project-assets` bucket holds the
generated images for those projects. Purge them by project ID:

```bash
# List project IDs created during the run (all belong to the throwaway DB user).
psql alphawolf_e2e_g21 -t -c "SELECT id FROM projects;" | tr -d ' '
```

For each project ID, delete its objects from the live `project-assets` bucket via the
Supabase Storage API (direct SQL delete is blocked by `storage.protect_delete`):

```bash
# Using the Supabase CLI or the MCP storage tool, list then delete objects whose
# path prefix matches generations/<projectId>/ and showcase/<projectId>/.
# Example using curl with the service-role key (never store the key in this file):
#
#   curl -X DELETE \
#     "https://<project>.supabase.co/storage/v1/object/project-assets/generations/<projectId>/" \
#     -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
#
# Repeat for "showcase/<projectId>/".
```

Do NOT delete any object whose project ID is not in your throwaway DB. The
`vehicle-templates` bucket (58 objects) must remain untouched.

Verify the baseline is restored:

```bash
# Count remaining project-assets objects - should match the pre-run baseline (4,
# from the Goal 16 / 20 purge). Any delta beyond your run's project IDs indicates
# concurrent activity; leave those untouched.
```

Drop the throwaway DB after confirming net-zero:

```bash
dropdb alphawolf_e2e_g21
```

---

## Step 9: Record results

Append to `activities.md` (top entry) with:

- Screenshots captured (location `/tmp/goal21-e2e/`).
- Confirmed assertions: 3 on-photo concepts, showcase composite visible, PDF valid,
  no photo view in the spec pack.
- fal spend in USD (check the fal dashboard or Anthropic + fal billing dashboards).
- Net-zero: `project-assets` before/after object count.

---

## Invariant reminders

- **Photo renders are never the print deliverable.** `loadFinalViews` (in
  `load-spec-pack-data.ts`) filters `render_target = 'template'` only. The export
  spec pack hero and views must all be template-geometry renders. Verify this manually
  in the PDF.
- **The daily spend cap is real money.** `AI_CONFIG.dailySpendCapUsd = 5` bounds every
  run server-side. The e2e cap for this goal is $10. Stop early if spend looks anomalous.
- **`DIRECT_URL` for the prod DB is read-only here.** Only the `COPY ... FROM ... TO`
  commands in Step 4 touch the live DB; they are read-only exports. No INSERT, UPDATE,
  or DELETE against prod is ever done in this recipe.
- **No `prisma migrate deploy` against prod** in this recipe. Migrations go to the
  throwaway DB only. Prod migration is a separate controller step using Supabase MCP.
