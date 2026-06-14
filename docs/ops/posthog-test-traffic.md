# PostHog test-traffic filtering (Goal 9 rider 6)

_Authored 2026-06-13. So launch dashboards reflect real users, not smoke/E2E runs._

## The problem

Local E2E, smoke, and proof runs execute the real app against the **live shared
DB** and fire real PostHog events (signup → generation → export). Pre-launch,
analytics is mostly this synthetic traffic.

## The fix — two layers

### 1. An `is_test` person property (code)

At account activation (`verifyOtpAction`, on the signup `credits_granted` event),
the app writes a person property via PostHog `$set`:

```
is_test = users.isSyntheticTestEmail(email)   // true for @e2e.alphawolf.test / @test.alphawolf.example
```

The signup grant always credits a fresh account, so this fires once per new
account. **Person-on-events** then carries `is_test` onto every subsequent event
that account produces (generation, export, orders, …) — one tag, whole funnel.
Real signups get `is_test = false`, so they're explicitly included.

### 2. PostHog internal-&-test-account filter (project config)

In **Project Settings → "Filter out internal and test users"**, add the filter:

```
person.is_test  =  true
```

Every insight/dashboard with "Filter out internal and test users" enabled then
excludes synthetic accounts. (Apply once; it's a project-level setting.)

## What's covered / not covered

- **Covered:** all events from a synthetic account AFTER it activates — the bulk
  of E2E/smoke pollution (the authenticated funnel).
- **Not covered (documented limits):**
  - **Historical events** ingested before this shipped keep their old (untagged)
    person state — person-on-events is point-in-time. Clean going forward; for a
    one-time backfill, retire the synthetic accounts (`db:retire-test-accounts`,
    rider 5) and/or filter by date.
  - **Anonymous public-page events** (`share_page_viewed`, `concept_voted` on the
    unauthenticated share page) are keyed by a cookie id, not a person, so they
    can't carry `is_test`. These are low-volume; if E2E coverage of the share
    page grows, add a `?test=1`-style tag on the synthetic share visits.
