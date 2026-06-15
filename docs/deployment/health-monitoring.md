# Health & uptime monitoring (Goal 11 D7)

_Last verified 2026-06-15 against production (`alphawolfedecals-app-web.vercel.app`)._

## Endpoints

| Path        | Purpose            | Runtime | Touches DB? | Live check (2026-06-15)                         |
| ----------- | ------------------ | ------- | ----------- | ----------------------------------------------- |
| `/health`   | Liveness probe     | Edge    | No          | `200` → `{"status":"ok","commit":"<sha>"}`      |
| `/vehicles` | DB-readiness probe | Node    | Yes (RLS)   | `200` (renders the published-vehicle catalogue) |

`/health` (`apps/web/app/(public)/health/route.ts`) is a **liveness** probe: it
returns `200 {status:'ok', commit}` and is intentionally shallow — Edge runtime,
**no DB query**. Two reasons it stays DB-free:

1. **Prisma is incompatible with the Edge runtime** — adding a DB check means
   moving `/health` to Node (cold starts, heavier).
2. **`connection_limit=1` invariant** (see `docs/deployment/` topology): a DB
   ping on every monitor poll would hold the single pooled connection and
   contend with real traffic. A liveness probe should not depend on the DB —
   otherwise a transient DB blip false-alarms "app down" and can trigger
   needless restarts.

## Decision — `/vehicles` is the DB-reachability probe

DB-reachability is covered by monitoring **`/vehicles`**, a DB-backed page that
lists published vehicles through RLS. If Postgres or RLS is unreachable,
`/vehicles` fails — so it is a genuine readiness signal, deeper than `/health`.
The live UptimeRobot monitor already watches `/vehicles`; **keep it**. This
split (cheap DB-free liveness + DB-backed readiness) is the intended posture, not
a gap.

## Recommended UptimeRobot configuration

The UptimeRobot MCP is read-only — Archer adds/edits these in the UptimeRobot UI.

- **Keep (DB readiness):** `GET https://alphawolfedecals-app-web.vercel.app/vehicles`
  — HTTP(s) monitor, 5-min interval, expect `200`.
- **Optional add (fast liveness):** `GET https://alphawolfedecals-app-web.vercel.app/health`
  — keyword monitor, 1-min interval, keyword `ok` present. Catches "app process
  down / deploy broke" faster and independent of DB state.

When a **custom production domain** is attached, update both monitor URLs (and
the `smoke.yml` `.vercel.app` gate — see that workflow's header note).
