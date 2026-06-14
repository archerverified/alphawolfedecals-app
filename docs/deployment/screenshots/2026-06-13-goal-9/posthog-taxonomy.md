# Goal 9 — new PostHog event taxonomy

Captured 2026-06-13. The growth-loop events added this goal. (No dashboard
screenshot: most of these only populate with real growth-loop usage. The two
share-page events DID fire on prod during the closeout live proof — see the
evidence files in this folder.)

| Event                        | Where it fires                     | Key properties                                               | Status                                 |
| ---------------------------- | ---------------------------------- | ------------------------------------------------------------ | -------------------------------------- |
| `share_page_viewed`          | `/share/[token]` server render     | `project_id`, `concept_count`, `total_votes`                 | ✅ fired live on prod (closeout proof) |
| `concept_voted`              | vote route (`/share/[token]/vote`) | `concept_key`                                                | ✅ fired live on prod (closeout proof) |
| `referral_link_created`      | `/refer` (first code mint)         | —                                                            | awaits real usage                      |
| `referral_signup_attributed` | verify action (attributed signup)  | —                                                            | awaits real usage                      |
| `referral_credits_granted`   | verify action (each credited side) | `amount`, `side` (referee/referrer)                          | awaits real usage                      |
| `locator_opened`             | `/find-a-shop` server render       | `platform_shops`, `directory`                                | awaits real usage                      |
| `shop_handoff_clicked`       | locator UI                         | `source` (platform/directory/maps), `shop_id`/`name`/`query` | awaits real usage                      |

## Test-traffic filtering (rider 6)

A person property `is_test` is set at account activation (`$set` on the signup
`credits_granted` event), `true` for synthetic test domains. To exclude synthetic
traffic from launch dashboards, add the project filter **`person.is_test = true`**
under Project Settings → "Filter out internal and test users" (one-time UI action —
the PostHog MCP flags `project-settings-update` destructive/confirm-first, so it's
left for Archer). Full detail: `docs/ops/posthog-test-traffic.md`.

## Live proof evidence (this folder)

- `share-page-prod.html` — the SSR'd `/share/GOAL9PROOF99` page from prod: 3 concepts
  (Bold Geometric / Clean Minimal / Wild Camo), the "2024 Ford Transit 250" vehicle
  label, the crew-favorite tally — and **no PII** (grep for owner/email/name = empty).
- `vote-response.json` — a live vote POST: `{ok:true, totalVotes:2, …}`; invalid
  concept → 400, bad token → 404. Synthetic seed cleaned up after (0 rows left).
