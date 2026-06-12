# Goal 7 — PostHog event taxonomy evidence (2026-06-12, queried 10:58 UTC)

Query: events table, last 12h, Goal-7 event names (PostHog MCP `execute-sql`).

| event | count | first seen (UTC) | last seen (UTC) | source |
|---|---|---|---|---|
| ai_bakeoff_call | 11 | 07:33:17 | 07:38:11 | PROD — real fal spend, one event per bake-off image, cost properties attached |
| generation_run_completed | 9 | 10:15:21 | 10:50:48 | live local e2e (real DB, mock renders, real Haiku orchestrator) |
| generation_run_started | 4 | 10:12:46 | 10:46:35 | live local e2e |
| iteration_started | 3 | 10:15:36 | 10:49:01 | live local e2e |
| final_started | 3 | 10:16:44 | 10:50:02 | live local e2e |
| final_handoff_completed | 3 | 10:17:46 | 10:51:03 | live local e2e |
| generation_failed | 1 | 10:35:38 | 10:35:38 | live local e2e (the editor-race run — refund path fired) |

Not yet observed (expected): `credit_waitlist_joined`, `generation_viewed`, `concept_selected` are **client-side** posthog-js events — the local e2e environment has no `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`, so they no-op locally and will first appear on prod traffic. `ai_spend_cap_hit`, `generation_swept`, `ai_mock_served_in_prod` are alert/tripwire events that correctly have not fired.
