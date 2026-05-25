# Demo screenshots

Captured by `apps/web/e2e/demo-screenshots.spec.ts` against the production
deploy (`https://alphawolfedecals-app-web.vercel.app`). Re-run after a deploy:

```bash
DEPLOY_URL=https://alphawolfedecals-app-web.vercel.app \
  pnpm --filter @alphawolf/web exec playwright test e2e/demo-screenshots.spec.ts
```

Last captured: 2026-05-25 against commit `7ab8ad7` (matches `/health`).

## Phase 1 reachable — captured here (public surfaces)

| File                   | Route             | Notes                                  |
| ---------------------- | ----------------- | -------------------------------------- |
| `01-landing.png`       | `/`               | Landing + customer / wrap-shop CTAs    |
| `02-signin.png`        | `/signin`         | Sign-in form                           |
| `03-signup-shop.png`   | `/signup-shop`    | 6-field shop signup (golden-path form) |
| `04-vehicle-browse.png`| `/vehicles/select`| Vehicle picker (NB: `/vehicles` 404s)  |

## Phase 2 dependent — NOT captured (need features that don't exist yet)

These require production OTP delivery + an authenticated project. They are
**Phase 2 dependencies**, not Phase 4 perf follow-ups. The spec's authenticated
block self-skips on prod (dev-otp is gated off) and will produce these only
when run against a dev/preview env with dev routes enabled.

| Planned file              | Blocker                                                              |
| ------------------------- | ------------------------------------------------------------------- |
| `04-vehicle-detail` (doc) | **Phase 1 bug:** `/vehicles/[id]` returns **500** on prod — triage  |
| `05-projects-empty.png`   | `/projects` → 307 → `/signin` (prod OTP gated; `phase-2-dependency`) |
| `06-editor-empty.png`     | editor lives at `/projects/[id]/editor`; needs auth + a project     |
| `07-editor-with-asset.png`| same — needs authenticated editor + asset upload                    |
| `08-editor-oob-cue.png`   | same — needs authenticated editor                                   |
| `09-undo-redo.png`        | same — needs authenticated editor                                   |

See `/activities.md` (2026-05-25 entry) for the full finding list and the
`phase-2-dependency` tag.
