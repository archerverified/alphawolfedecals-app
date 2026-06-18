# Goal 19 — Dependency Triage (12 Dependabot PRs)

Triage of the 12 open Dependabot PRs into safe batch / dev-tooling majors / runtime
majors, with the security advisories each bump clears. 11 of 12 PRs landed across 5
consolidated PRs (#196-#200); Prisma 7 (#180) held with a documented plan.

```mermaid
flowchart TD
  D1["D1: audit + security rank<br/>pnpm audit = 2 crit / 4 high / 6 mod (all dev-only)<br/>strict-up-to-date branch protection"]

  D1 --> A["Tier A — safe batch<br/>PR #196 (merged)"]
  D1 --> B["Tier B — dev-tooling majors"]
  D1 --> C["Tier C — runtime majors"]

  %% Tier A
  A --> A1["#112 commitlint-config 19->21<br/>#113 lint-staged 15->17<br/>#176 checkout 4->6<br/>#177 gitleaks-action 2->3 (scan verified)<br/>#187 minor-and-patch x9 (sharp synced)"]
  A1 --> Amg(["MERGED #196"])
  Amg --> Ainc["INCIDENT: sharp 0.34.5->0.35.1 (in #187)<br/>fails to load on the Vercel linux-x64 lambda<br/>(Sentry NODE-E) -> 500s on sharp routes ~1h"]
  Ainc --> Afix(["HOTFIX #201: revert sharp -> 0.34.5<br/>prod re-verified: routes 200, sharp error stopped"])

  %% Tier B
  B --> B1["#182 eslint 9->10<br/>(+@eslint/js, 5 in-code rule fixes)<br/>#183 @types/node 22->25<br/>#179 @vercel/analytics 1->2"]
  B --> B2["#184 vitest 2->4 (+vite 7)<br/>SECURITY: clears critical vitest CVE<br/>+ vite/esbuild; db workspace->projects"]
  B1 --> Bmg(["MERGED #197"])
  B2 --> B2mg(["MERGED #198"])

  %% Tier C
  C --> C1["#108 resend 4->6<br/>no code change; REAL OTP delivery verified"]
  C --> C2["#181 next 15->16<br/>2 blockers fixed: --webpack bridge<br/>+ next.config.mjs (ADR-0015)<br/>clears 9 GHSAs (7 High)"]
  C --> C3["#180 @prisma/client 5->7<br/>driver-adapter rewrite of the ADR-0014<br/>DB split; not a security fix"]
  C1 --> C1mg(["MERGED #199"])
  C2 --> C2mg(["MERGED #200<br/>ADR-0015; advisor MERGE<br/>prod header/route/Sentry checks"])
  C3 --> C3held(["HELD with plan<br/>docs/deps/prisma-7-upgrade-plan.md"])

  %% Security outcome
  Amg --> SEC
  Bmg --> SEC
  B2mg --> SEC
  C1mg --> SEC
  C2mg --> SEC
  SEC["Security: critical vitest + vite/esbuild cleared (#198);<br/>7 High Next GHSAs cleared (#200);<br/>RESIDUAL (dev-only): ws + form-data via jsdom@25<br/>(no PR bumps jsdom) -> documented"]

  classDef merged fill:#1f8a4c,color:#fff,stroke:#0d5;
  classDef held fill:#b35900,color:#fff,stroke:#f80;
  classDef sec fill:#00AEEF,color:#012,stroke:#0088c0;
  class Amg,Bmg,B2mg,C1mg,C2mg,Afix merged;
  class C3held,Ainc held;
  class SEC sec;
```

## Outcome summary

| PR(s) | Bump | Disposition |
|---|---|---|
| #196 | Tier A: commitlint-config, lint-staged, checkout, gitleaks-action, minor-and-patch x9 | Merged (5 Dependabot PRs batched) |
| #197 | eslint 9->10 (+ 5 rule fixes), @types/node 22->25, @vercel/analytics 1->2 | Merged |
| #198 | vitest 2->4 + vite 7 (security: critical vitest CVE) | Merged |
| #199 | resend 4->6 (OTP transport; real delivery verified) | Merged |
| #200 | next 15->16 (+ --webpack bridge + .mjs config; ADR-0015) | Merged |
| #180 | @prisma/client 5->7 (driver-adapter rewrite) | **Held** with upgrade plan |

**Dependency launch-gate: cleared** for 11/12 PRs. The one hold (Prisma 7) carries no
security debt (no advisory on 5.22) and has a documented, scheduled upgrade plan.
