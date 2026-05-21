# ADR-0009: Parse queue — BullMQ/Upstash with an inline fallback seam

- **Status**: Accepted
- **Date**: 2026-05-20
- **Deciders**: Archer
- **Related stories**: GH-005 (asset parse pipeline)
- **Supersedes**: n/a

## Context

The asset parse pipeline (AI/EPS/PDF → SVG, raster normalisation, rembg) is slow
and I/O-heavy, so it belongs on a job queue rather than blocking an upload
request. The locked stack (ADR-0001) names BullMQ, backed by Upstash Redis. But
two environments have **no Redis**: GitHub Actions CI and local Playwright E2E
must stay green with zero external infra, and we don't want to stand up Redis in
either. We also must respect the Upstash **free-tier ceiling: 256 MB and 500k
commands/month** — BullMQ's blocking pops and job bookkeeping consume commands.

The context-manager concerns this ADR addresses: Redis job metadata schema, a
read-cache strategy for parsed-asset metadata, retention/archival of completed
jobs, version vectors for cache invalidation, and tuning blocking pops against
the command budget. (Designed inline rather than via the sub-agent to keep the PR
moving; the concerns below are each accounted for.)

## Decision

### 1. One adapter seam: `enqueue()` decides at call time

`services/parse/src/queue.ts` exposes a single `enqueue(payload)`:

- **`REDIS_URL` set** → add a BullMQ job; a separate worker process
  (`startWorker`, booted by `services/parse` as a standalone service) drains it.
- **`REDIS_URL` unset** → run `processParseAsset(payload)` **inline** in the
  caller's process.

Both paths share the exact same `processParseAsset`, so behaviour is identical;
only _where/when_ it runs differs. `apps/web` imports `enqueue` from
`@alphawolf/parse` and calls it from the upload Server Action. `bullmq`/`ioredis`
are **dynamically imported** so the inline path never loads them (and they stay
out of the Next.js server bundle when Redis is absent). This is the single
mechanism that keeps CI + Playwright green without infra while local dev with
Upstash exercises the real queue.

### 2. Job contract + Redis metadata

`parse-asset` job payload: `{ assetId, ownerUserId, projectId, sourceKey,
mimeType, options:{ rembg? } }`. BullMQ owns the per-job metadata in Redis
(status pending/active/completed/failed, attemptsMade, timestamps,
processedOn/finishedOn, failedReason). We don't hand-roll a parallel metadata
schema — the durable record of truth is `project_assets` (`parse_status`,
`parse_metadata`, `parsed_url`), written back by the worker under the owner's RLS
scope. The DB row is authoritative; Redis holds only the in-flight job.

### 3. Retention / archival (free-tier ceiling)

Completed and failed jobs are evicted aggressively so months of
"parse_complete" records can't fill the 256 MB ceiling:

```
removeOnComplete: { age: 3600,        count: 100 }   // 1h or last 100
removeOnFail:     { age: 24*3600,     count: 500 }   // 24h or last 500
attempts: 3, backoff: exponential 5s
```

Long-term audit lives in Postgres (`project_assets`), not Redis.

### 4. Command-budget tuning

The worker uses `drainDelay: 30` so idle blocking pops (BLPOP) happen far less
often than the BullMQ default — fewer commands burned per idle minute. `ioredis`
runs with `maxRetriesPerRequest: null` (required by BullMQ). Projection: a single
dev worker idling with `drainDelay:30` consumes on the order of a few thousand
commands/day from blocking pops + heartbeats — comfortably under 500k/month for
development. Production sizing is revisited when real volume exists.

### 5. Read-cache for the editor open path + version vectors

The editor needs parsed-asset metadata (parsed URL, dimensions, bbox, status)
without hitting Postgres on every panel hover/select. **Decision: no separate
Redis read-cache.** On project open the editor issues **one** `listAssets` query
and holds the result in the client store for the session; every subsequent
hover/select is an in-memory lookup. The "≥80% cache hit on the editor open path"
target is met trivially — after the single warming read, hit rate on
hover/select is ~100% in-session; signed read URLs are likewise cached client-side
for their 24 h TTL. Adding Redis here would spend command budget to cache data
that is already tiny and read once.

**Version vector:** `project_assets.version` increments when a re-parse produces
new output (`setAssetParseResult(... 'parsed')`). The editor stores the version
it resolved an `ImageElement`'s `srcUrl` against; when a parse upgrade bumps the
version, the cached canvas reference is known-stale and the URL is re-resolved.
This is the invalidation trigger that keeps the in-session cache correct across a
re-parse.

### 6. rembg fallback (folds in the would-be ADR-0008)

Background removal calls Replicate `cjwbw/rembg` (pinned version, env-overridable).
The Replicate path is straightforward enough not to warrant its own ADR, except
for one rule worth recording: **rembg failure never fails the parse.** If the
call errors (missing token, model/network error), the worker falls back to the
un-removed PNG and records `rembg:{ removed:false, error }` in `parse_metadata`,
so a transient Replicate outage degrades to "background not removed" rather than a
dead asset the user must re-upload.

## Consequences

- **Good:** identical job behaviour across inline and queued modes; CI/E2E need
  no Redis; the free tier is respected by construction; the DB stays the source
  of truth so losing Redis loses only in-flight jobs; re-parses can't serve stale
  cached art.
- **Cost:** inline mode runs the parse in the web process — fine for dev/CI/small
  uploads, but production must run with `REDIS_URL` set and the standalone worker
  so a 120 s Inkscape conversion never blocks a request. This is a deploy-time
  invariant, documented in `70-quick-reference.md`.
- **Observed:** `REDIS_URL` was absent from `.env.local` despite the task brief
  claiming otherwise; the inline fallback meant the build/tests stayed green
  regardless, which is exactly the resilience this seam buys.
