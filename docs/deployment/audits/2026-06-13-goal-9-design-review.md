# Design review — Goal 9 growth-loop surfaces (2026-06-13)

Mode: **diff-aware** (design-review skill). Scope: the Goal-9 surfaces shipped this
goal — the share-for-feedback page (`/share/[token]`), the referral page (`/refer`),
the shop locator (`/find-a-shop`), and the studio/signup growth entry points.

**Scope note (honest):** the full live B2C flow (wizard → generation → export)
requires an authenticated prod session (email OTP) that wasn't available this
session, so that flow was audited at the **code level**, not live-browsed. The
growth-loop surfaces — this goal's actual deliverables — got the focused audit +
surgical fixes below. A full live design-review of the authenticated flow is a
Goal-10 launch-hardening item.

## Findings + fixes (surgical, no redesign)

| #   | Impact   | Finding                                                                                                                                    | Fix                                                                                                               |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| 1   | **High** | Share-page concept images used `object-cover` — it **crops the very vehicle/design being voted on** (the core content of the page).        | → `object-contain` on the neutral bg, so the whole vehicle shows.                                                 |
| 2   | Medium   | Locator "Choose" button was a one-off `bg-sky-600` while **every other primary button in the app is `bg-zinc-900`** (projects, signup, …). | Aligned to the `zinc-900` primary; unified the chosen-state highlight to **emerald** (the app's positive accent). |
| 3   | Medium   | Locator empty state (0 partner shops) was sparse — just an input + a single button — reading as unfinished.                                | Added a contextual helper line that frames the maps fallback and the spec-pack handoff.                           |
| 4   | Low      | Referral "Credits earned" stat used `text-sky-700`; the app's positive-number accent is **emerald**.                                       | → `text-emerald-700`.                                                                                             |
| 5   | Low      | Locator input focus ring was `sky-500`; the app's focus convention is `zinc-900`.                                                          | → `zinc-900`.                                                                                                     |

Root theme: the new surfaces had drifted to a generic **sky/blue** accent the rest
of the app doesn't use (it's `zinc-900` primary + `emerald` for positive/success).
The fixes pull the growth surfaces back onto the existing system — clarity +
consistency, no new tokens, no structural change.

## Grades

|             | Before | After |
| ----------- | ------ | ----- |
| **Design**  | B      | A−    |
| **AI-Slop** | A−     | A     |

Not slop to begin with (purposeful layouts, real content, no gradient-orb hero,
no emoji-as-icon system) — the gains are the cropped-content fix (real usability)
and palette consistency. Deferred: live audit of the authenticated wizard →
generation → export flow (Goal 10).
