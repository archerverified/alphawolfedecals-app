# Render environment variables — apps/api, services/parse, services/ai

> **Documentation only. Never paste real values here.**
>
> Step-by-step checklist for the first Render deploy. Perform these steps in the
> Render Dashboard under each Service → Environment.
>
> For the full env var spec (rotation, source, ownership), see `env-matrix.md`.

## Prerequisites

1. Render account at render.com.
2. Connect your GitHub account and authorize access to `archerverified/alphawolfedecals-app`.
3. Create a new **Blueprint** deployment pointing at the repo root (where `render.yaml` lives).
4. Render will detect `render.yaml` and propose the three services: `alphawolf-api`,
   `alphawolf-parse`, `alphawolf-ai`.
5. For each service, set the `sync: false` env vars listed below.

## alphawolf-api (Node.js web service)

Set these in Dashboard → alphawolf-api → Environment:

| Variable             | Value source                                          |
| -------------------- | ----------------------------------------------------- |
| `SENTRY_DSN`         | Sentry → Project Settings → Client Keys (DSN)         |
| `DATABASE_URL`       | Supabase pooler, superuser (port 6543)                |
| `DATABASE_URL_APP`   | Supabase pooler, app_user (port 6543)                 |
| `DIRECT_URL`         | Supabase session pooler (port 5432)                   |
| `PII_ENCRYPTION_KEY` | Existing project key — never rotate without migration |
| `AUTH_SECRET`        | Auth.js JWT signing key (`openssl rand -base64 32`)   |

Pre-set (not secrets, already in render.yaml):

| Variable             | Value        |
| -------------------- | ------------ |
| `NODE_ENV`           | `production` |
| `SENTRY_ENVIRONMENT` | `production` |

## alphawolf-parse (Node.js worker service)

Set these in Dashboard → alphawolf-parse → Environment:

| Variable                    | Value source                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `REDIS_URL`                 | upstash.com → database → Connect → **TCP** tab → full `rediss://` URL. This activates BullMQ; absent = inline mode. |
| `SENTRY_DSN`                | Same Sentry DSN as api                                                                                              |
| `DATABASE_URL`              | Supabase pooler, superuser                                                                                          |
| `DATABASE_URL_APP`          | Supabase pooler, app_user                                                                                           |
| `DIRECT_URL`                | Supabase session pooler                                                                                             |
| `PII_ENCRYPTION_KEY`        | Same as api                                                                                                         |
| `SUPABASE_URL`              | `https://dxwnzxlmggpdjyoxdybh.supabase.co`                                                                          |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API Keys → `sb_secret_…` key                                                                  |
| `REPLICATE_API_TOKEN`       | replicate.com → API tokens. Optional: if absent, rembg degrades to un-removed image.                                |

Pre-set:

| Variable             | Value        |
| -------------------- | ------------ |
| `NODE_ENV`           | `production` |
| `SENTRY_ENVIRONMENT` | `production` |

**inkscape / pdf2svg availability:**
Neither is installed on the Phase 1 free-tier managed Node environment. Assets that
require inkscape (AI/EPS→SVG) or pdf2svg (PDF→SVG) will set
`parse_status = 'queued_missing_cli'` instead of converting. PNG/JPEG/SVG/rembg work
normally. Phase 4: migrate to a Docker service with these tools pre-installed.

## alphawolf-ai (Python FastAPI web service)

Set these in Dashboard → alphawolf-ai → Environment:

| Variable          | Value source                                   |
| ----------------- | ---------------------------------------------- |
| `POSTHOG_API_KEY` | PostHog → Project → Project Settings → API Key |

Pre-set (in render.yaml):

| Variable       | Value                      |
| -------------- | -------------------------- |
| `POSTHOG_HOST` | `https://us.i.posthog.com` |

---

## Connecting the GitHub repo (Archer-only steps)

**These steps cannot be done by Claude Code.**

### Option A — Blueprint (recommended, uses render.yaml)

1. Render Dashboard → **Blueprints** → **New Blueprint Instance**
2. Connect repo: `archerverified/alphawolfedecals-app`
3. Branch: `main`
4. Render detects `render.yaml` at the repo root and shows all three services
5. Review the plan → **Apply**
6. For each service: set the `sync: false` env vars from the tables above

### Option B — Manual service creation

Create each service individually:

**alphawolf-api:**

- Type: Web Service
- Runtime: Node
- Region: Oregon (US West)
- Root Directory: ` ` (repo root)
- Build Command: `corepack enable && pnpm install --frozen-lockfile && pnpm --filter @alphawolf/db prisma:generate && pnpm --filter @alphawolf/api build`
- Start Command: `node apps/api/dist/index.js`
- Health Check Path: `/health`
- Plan: Free

**alphawolf-parse:**

- Type: Background Worker
- Runtime: Node
- Region: Oregon (US West)
- Root Directory: ` ` (repo root)
- Build Command: `corepack enable && pnpm install --frozen-lockfile && pnpm --filter @alphawolf/db prisma:generate && pnpm --filter @alphawolf/parse build`
- Start Command: `node services/parse/dist/index.js`
- Plan: Free

**alphawolf-ai:**

- Type: Web Service
- Runtime: Python 3.12
- Region: Oregon (US West)
- Root Directory: `services/ai`
- Build Command: `pip install uv && uv sync`
- Start Command: `uv run uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Health Check Path: `/health`
- Plan: Free

---

## Post-deploy verification

1. `alphawolf-api`: `curl https://<render-api-url>/health` → `{"status":"ok","service":"api"}`
2. `alphawolf-parse`: Check Render logs for `[parse] BullMQ worker started` (when `REDIS_URL` is set)
3. `alphawolf-ai`: `curl https://<render-ai-url>/health` → `{"status":"ok","service":"ai"}`

---

## Render free-tier limitations (document; revisit at Phase 4)

- Services spin down after 15 minutes of inactivity. First request after spin-down
  takes ~30 seconds for cold start. Not acceptable for production; acceptable for
  Phase 1 demo where Archer controls the timing.
- No per-PR preview deploys on free tier (Starter tier required).
- Build time limit: 100 minutes. The pnpm monorepo build is ~3–5 minutes in practice.
- No persistent disk on free tier (no local file storage at runtime — correct, we use
  Supabase Storage).
