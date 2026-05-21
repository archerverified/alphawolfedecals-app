# ADR-0007: Supabase Storage bucket strategy

- **Status**: Accepted
- **Date**: 2026-05-20
- **Deciders**: Archer
- **Related stories**: GH-005 (asset upload), GH-003/004 (vehicle templates)
- **Supersedes**: the dev-only local file store added in PR #37
  (`packages/db/src/storage/vehicle-assets.ts`)

## Context

PR #37 shipped a deliberate stopgap: uploaded vehicle-template SVGs were written
to a git-ignored `.vehicle-assets/` directory and served through an
`/api/vehicle-assets/[vehicleId]/[filename]` route. It fails closed in
production. GH-005 needs real object storage for two distinct asset classes:

1. **Vehicle templates** — shared, public, non-PII catalog assets (outline SVGs,
   generated PNG thumbnails). Any visitor may read them.
2. **Project assets** — per-user uploaded artwork + parse output. Strictly
   private to the owning user.

A complication shapes the whole design: **this app uses custom auth** (the
`app.current_user_id` GUC inside our own Postgres transactions; ADR-0002), **not
Supabase Auth**. So `auth.uid()` is never populated in the Storage request
context, and storage.objects RLS keyed to a Supabase user cannot see our session
user.

## Decision

Two buckets on the shared dev Supabase project, provisioned by an idempotent
script (`packages/db/scripts/provision-storage.ts`, `pnpm --filter @alphawolf/db
storage:provision`), both capped at 50 MB with a MIME allowlist:

| Bucket              | Visibility  | Reads                       | Writes                            |
| ------------------- | ----------- | --------------------------- | --------------------------------- |
| `vehicle-templates` | **public**  | direct public URL           | service role                      |
| `project-assets`    | **private** | short-lived **signed** URLs | service role / signed upload URLs |

**Access control for `project-assets` lives at the application layer, not in
storage RLS.** Because our session user is invisible to Storage, the private
bucket is simply _closed by default_ (no public policies → only the service role
can touch it). Every grant is an **ownership-checked, short-lived signed URL**:
the Server Action first confirms the session user owns the asset's project
(through the RLS-enforced `getProject` under `withUser`), then mints a signed URL
scoped to that one object key. Object keys are project-scoped
(`{projectId}/{assetId}/{filename}`) so the key itself encodes the boundary the
server checks.

- **Signed-URL TTL = 24 h** (`SIGNED_URL_TTL_SECONDS`). Long enough for an
  editing session plus the parse round-trip; short enough that a leaked URL
  expires within a day.
- **Uploads bypass Server Actions.** The browser gets a signed _upload_ URL
  (`createSignedUploadUrl`) and PUTs the file straight to Storage
  (`uploadToSignedUrl`), so large files never stream through a Server Action.
- **The service-role client is server-only** (`packages/db/src/storage/
supabase.ts`) — it bypasses Storage RLS and must never reach a client bundle
  (the `@alphawolf/db` barrel is already server-only via Prisma).

The vehicle-template flow moves off the local store: `admin-vehicle.ts` and the
seed upload to `vehicle-templates`; `vehicles.outline_svg_url` /
`thumb_png_url` store the bucket's public URLs; the local-store route + module
are removed. A one-shot migration (`scripts/migrate-local-assets.ts`) uploads any
existing `.vehicle-assets/*` SVGs, generates **real PNG thumbnails** via Sharp,
rewrites the DB URLs, backfills `vehicle_panels.printable_area_mm2` from
wrap-safe geometry, and wipes the local store.

**SVG sanitisation:** parsed/served SVGs pass a baseline strip of `<script>`,
`<foreignObject>`, `on*` handlers, and `javascript:` hrefs (`sanitizeSvg`). This
is defence-in-depth (the editor renders SVG via Konva/Image, not innerHTML), not
a full DOMPurify — that needs a DOM and is out of scope for the worker.

## Consequences

- **Good:** public templates are cache-friendly CDN URLs with no app hop;
  private assets are inaccessible without an ownership-checked, expiring URL; no
  files flow through Server Actions; provisioning is reproducible and idempotent.
- **Cost / caveat:** authorization is only as strong as the Server Action checks
  — there is no storage-RLS safety net, so every code path that mints a signed
  URL **must** verify ownership first (the same discipline `withSystem` already
  requires). If the app later adopts Supabase Auth, storage RLS keyed to
  `auth.uid()` could be layered on as a second fence.
- **Operational footgun (observed 2026-05-20):** the `service_role` JWT in
  `.env.local` failed Storage signature verification (legacy JWT secret rotated /
  legacy keys disabled). Buckets were provisioned via the Supabase MCP as a
  fallback; runtime storage requires a current `service_role` or `sb_secret_…`
  key. See `docs/vault/70-quick-reference.md`.
