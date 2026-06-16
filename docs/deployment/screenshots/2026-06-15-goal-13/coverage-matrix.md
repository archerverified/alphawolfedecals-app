# Goal 13 — Full E2E Acceptance: Coverage Matrix

Environment: **LOCAL build, throwaway Postgres (`alphawolf_e2e_goal13`), real catalogue copied from live; durable spec on the MOCK provider (CI-safe, free, reproduced ≥3×); the headline export proven once on REAL fal.** Storage (logo + generated images) writes to the live `project-assets` bucket and is purged net-zero (scoped to this run's project IDs). Vehicle art + conditioning renders are read read-only from the live public `vehicle-templates` bucket.

Spec: `apps/web/e2e/goal-13-full-journey.spec.ts` (POM). Gallery: `docs/deployment/screenshots/2026-06-15-goal-13/NN-*.png`.

Legend: ✅ covered + asserted · 👁️ visited/screenshotted only · ⛔ out of journey scope (logged) · — n/a

## Core B2C customer journey (the spec drives + asserts every row)

| #   | Route / surface                         | Auth          | In journey | Status | Screenshot                    | Notes                                                                                      |
| --- | --------------------------------------- | ------------- | ---------- | ------ | ----------------------------- | ------------------------------------------------------------------------------------------ |
| 1   | `/` landing                             | public        | ✅         | green  | `01-landing.png`              | entry CTAs present                                                                         |
| 2   | `/signup`                               | public        | ✅         | green  | `02-signup.png`               | new customer, dev-OTP                                                                      |
| 3   | `/verify`                               | public(email) | ✅         | green  | `03-verify.png`               | OTP via `/api/auth/dev-otp` (in-proc ring buffer)                                          |
| 4   | `/welcome`                              | customer      | ✅         | green  | `04-welcome.png`              | post-verify landing                                                                        |
| 5   | `/vehicles/select`                      | public        | ✅         | green  | `05-catalogue.png`            | year/make/model cascade → BMW X3                                                           |
| 6   | `/vehicles/[id]` (X3)                   | public        | ✅         | green  | `06-vehicle-detail-x3.png`    | `start-project-cta` → `start-project-submit`                                               |
| 7   | `/projects/[id]/editor` (empty)         | customer      | ✅         | green  | `07-editor-empty.png`         | lands here on project create                                                               |
| 8   | brief step: zones                       | customer      | ✅         | green  | `08-brief-zones.png`          | diagram + checklist toggle, `zone-summary`                                                 |
| 9   | brief step: photos                      | customer      | ✅         | green  | `09-brief-photos.png`         | photo upload + note                                                                        |
| 10  | brief step: **logo**                    | customer      | ✅         | green  | `10-brief-logo.png`           | **alpha-wolf-logo.svg**; vector → quality gate PASSES ("prints sharp"); assigned to a zone |
| 11  | brief step: colors                      | customer      | ✅         | green  | `11-brief-colors.png`         | brand palette **#000000 / #FFFFFF / #35B6E8**                                              |
| 12  | brief step: style                       | customer      | ✅         | green  | `12-brief-style.png`          | **Aggressive** preset + free-text prompt                                                   |
| 13  | brief step: zone notes                  | customer      | ✅         | green  | `13-brief-zone-notes.png`     | per-zone instruction persisted                                                             |
| 14  | brief step: materials                   | customer      | ✅         | green  | `14-brief-materials.png`      | premium cast                                                                               |
| 15  | brief step: tint                        | customer      | ✅         | green  | `15-brief-tint.png`           | state-legality verdict (`data-status`)                                                     |
| 16  | brief step: extras                      | customer      | ✅         | green  | `16-brief-extras.png`         | one extra toggled                                                                          |
| 17  | brief step: AI notes                    | customer      | ✅         | green  | `17-brief-ai-notes.png`       | free-text note                                                                             |
| 18  | brief step: review                      | customer      | ✅         | green  | `18-brief-review.png`         | credit cost shown on Generate                                                              |
| 19  | `/projects/[id]/generate` (in progress) | customer      | ✅         | green  | `19-generate-in-progress.png` | poll-driven pipeline, `run-progress`                                                       |
| 20  | generate → 3 concepts                   | customer      | ✅         | green  | `20-three-concepts.png`       | `concept-card-{literal,bolder,minimal}`; credit 5→4                                        |
| 21  | iterate once                            | customer      | ✅         | green  | `21-after-iteration.png`      | chip + free text; credit 4→3                                                               |
| 22  | select winner → free final              | customer      | ✅         | green  | `22-final-selected.png`       | `final-badge`; final free (stays 3)                                                        |
| 23  | editor: recognizable X3 art             | customer      | ✅         | green  | `23-editor-with-art.png`      | Konva `Image` backdrop; locked AI layers                                                   |
| 24  | editor: select wrap zone                | customer      | ✅         | green  | `24-editor-zone-selected.png` | `zone-inspector` name + calibrated area                                                    |
| 25  | editor: in-editor "Design with AI"      | customer      | ✅         | green  | `25-editor-ai-dialog.png`     | `design-with-ai` → `ai-credit-balance`                                                     |
| 26  | `/projects/[id]/export` PDF             | customer      | ✅         | green  | `26-export-pack.png`          | `application/pdf`, `%PDF-`, saved `goal-13-export-pack.pdf`                                |

## Surfaces NOT in the linear journey (coverage status for the whole surface)

| Route / surface                                | Auth        | Status         | Notes                                                                            |
| ---------------------------------------------- | ----------- | -------------- | -------------------------------------------------------------------------------- |
| `/signin`                                      | public      | ✅ exercised   | spec signs in after verify (`signIn`)                                            |
| `/projects` (list)                             | customer    | 👁️ via cleanup | `cleanupCreatedProjects` drives the real `/projects` card → delete path each run |
| `/refer` (referral)                            | customer    | ⛔ logged      | covered by Goal 9.1 referral regression; out of this journey's scope             |
| `/find-a-shop` (locator)                       | customer    | ⛔ logged      | post-export growth loop; covered separately                                      |
| `/dashboard` + `/dashboard/orders/[id]` (shop) | shop        | ⛔ logged      | shop fulfilment loop; covered by `mvp-flow.spec.ts`                              |
| `/signup-shop`, `/welcome/shop`                | public/shop | ⛔ logged      | shop onboarding; out of B2C journey                                              |
| `/admin/*`                                     | admin       | ⛔ logged      | admin template CRUD; covered by `admin-vehicle`/`template-studio` specs          |
| `/(public)/share/[token]`                      | public      | ⛔ not built   | P2 share-for-feedback (future)                                                   |
| `/privacy`, `/terms`                           | public      | 👁️ static      | legal copy (Goal 10 flagged copy as a launch blocker)                            |

## Accessibility (axe WCAG 2.2 AA) — key pages

All 8 scanned pages **axe-clean (0 violations)** — full table in `axe-results.md`.

| Page                                  | Result   |
| ------------------------------------- | -------- |
| `/` landing                           | ✅ 0     |
| `/signin` · `/signup`                 | ✅ 0 · 0 |
| `/vehicles/select` · `/vehicles/{X3}` | ✅ 0 · 0 |
| `/welcome`                            | ✅ 0     |
| editor                                | ✅ 0     |
| brief wizard                          | ✅ 0     |

## Design review (design-review.md)

Overall **Design B−**, **AI-Slop C+**. Strong app-UI bones (editor/brief/vehicle-detail); the front door (landing/welcome/auth) is brand-less (cyan #35B6E8 nearly absent) and the concepts page presents flat. Top fixes folded into `findings-and-defects.md` (D13-2, D13-4..D13-7).
