# Goal 9.1 — Cleanup & closeout

How the prod test-data leak was stopped, the backlog retired, and the two riders finished.

## The leak and the two-layer fix (D1)

```mermaid
flowchart TD
  subgraph leak["Per-deploy leak (BEFORE)"]
    deploy["Vercel PROD deploy"] --> smoke["smoke.yml — 3 specs<br/>mvp-flow + brief-wizard + aw-template"]
    smoke --> seed["signed in as ONE persistent<br/>@alphawolf.test smoke account"]
    seed --> proj["creates ~3 projects + 1 order<br/>NO teardown"]
    proj --> acc["148 projects / 52 orders<br/>accumulated forever"]
  end

  subgraph fix["Two-layer fix (D1, #166)"]
    direction TB
    sc["Self-clean (fast feedback)<br/>specs track created ids →<br/>afterEach soft-delete via /projects UI<br/>(authenticated, RLS-scoped)"]
    cron["Daily maintenance sweep (the guarantee)<br/>folded into existing sweep-generation cron<br/>(no 2nd cron — Hobby limits)"]
    cron --> purge["purgeTestProjects:<br/>owner ∈ PURGE cohort<br/>+ ownerShopId IS NULL (spares routed-order)<br/>+ updatedAt > 30min → hard-delete + storage"]
    cron --> retire["retireTestAccounts:<br/>RETIRE_SUFFIXES accounts only<br/>(never @alphawolf.test)"]
  end

  proj -. "soft-delete" .-> sc
  acc --> fix
  fix --> clean["net-zero active per run;<br/>rows hard-purged ≤1 day<br/>(proven: cron purged 106 projects)"]
```

## Cohorts — the safety guarantee

```mermaid
flowchart LR
  subgraph retireC["RETIRE cohort (whole account deleted)"]
    r1["@e2e.alphawolf.test"]
    r2["@test.alphawolf.example"]
    r3["@example.com"]
    r4["@example-shop.test"]
  end
  subgraph purgeC["PURGE cohort (projects only, account kept)"]
    p1["= RETIRE_SUFFIXES"]
    p2["+ @alphawolf.test<br/>(persistent smoke login)"]
  end
  retireC --> purgeC
  real["REAL: @alphawolfdecals.com (operator)<br/>+ real customers"] -->|never matches| safe["UNTOUCHED<br/>(allowlist = the gate)"]
```

## D2 retirement + the security-review fix

```mermaid
sequenceDiagram
  participant Op as db:retire-test-accounts
  participant Rev as §3 security review
  participant DB as prod DB
  Op->>DB: dry-run → classify 63 (all RETIRE_SUFFIXES, 0 admin)
  Op->>Rev: review destructive --apply
  Rev-->>Op: BLOCK — template_sources.created_by is RESTRICT FK<br/>(would abort mid-cohort)
  Op->>Op: fix retireOne (delete template_sources first)<br/>+ per-account isolation + --max ceiling
  Op->>DB: --apply --max=70
  DB-->>Op: RETIRED 63/63, 0 failures (users 80→17)<br/>operator + template_sources intact
```

## Deliverables → outcome

```mermaid
flowchart LR
  D1["D1 leak stopped<br/>#166"] --> OK["✅ all verified<br/>spend ≈ $0"]
  D2["D2 backlog retired<br/>63/63"] --> OK
  D3["D3 PostHog filter<br/>applied #167"] --> OK
  D4["D4 referral proven<br/>6/6 live #167"] --> OK
  D5["D5 rate_limits verdict<br/>+ admin-guard test #167"] --> OK
  D6["D6 shakedown<br/>22 pages, 2 a11y fixes #168"] --> OK
```
