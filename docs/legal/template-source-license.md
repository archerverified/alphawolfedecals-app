# Template source license review — Pro Vehicle Outlines (PVO)

> **Goal 1 STEP 1 deliverable.** This is the license gate for the autonomous vehicle-DB
> ingest chain (`mvp-execution-playbook.md` STEP C → STEP D). Read it before STEP 2 of
> any scrape goal fires. **This is not legal advice** — it is a conservative, evidence-based
> reading of the public license documents to decide whether the project may ingest PVO
> outlines. A licensing decision with real money behind it should be confirmed by counsel.

- **Source under review:** Pro Vehicle Outlines — `https://templates.provehicleoutlines.com/members/templates`
- **Licensor named in the EULA:** FIERY (the EULA is a Fiery/EFI-style End User License Agreement)
- **Reviewed by:** Claude (acting security-auditor + documentation-expert personas), for Archer
- **Date read:** 2026-05-25
- **Method:** read the public, unauthenticated license documents. **No member login, no scrape,
  no file download was performed** — STEP 1 only requires the legal terms, which are public.

---

## VERDICT: ⛔ RESTRICTIVE

**The PVO membership license does NOT grant the rights this project needs.** It prohibits
distribution, prohibits derivative works, and assigns all IP — including derivatives — to the
licensor. Ingesting PVO outlines into the AlphaWolf product database and serving them to
customers would breach the EULA and infringe the licensor's copyright.

Per the goal's own STEP 1 rule and the playbook's STEP D human checkpoint:

> **STOP. Do NOT proceed to STEP 2 (scrape).** The full-catalog ingest (Goal 2 / STEP E) must
> not fire against this source. Phase 2 requires a renegotiated, explicit commercial-redistribution
> license from the provider — or a different sourcing path (see "Pivot options" below).

This verdict **agrees with the project's own authoritative spec**, which already forbids this exact
action (see "Cross-reference" below). Nothing here is a surprise to the documented strategy.

---

## Documents reviewed (URL + date)

| Document | URL | Date read |
|---|---|---|
| End User License Agreement (EULA) | `https://www.provehicleoutlines.com/pvo-eula/` | 2026-05-25 |
| Subscription & Cancellation Terms | `https://www.provehicleoutlines.com/cancellation-terms/` | 2026-05-25 |
| Subscription FAQ | `https://www.provehicleoutlines.com/subscription-faq/` | 2026-05-25 |
| General FAQ | `https://www.provehicleoutlines.com/faq/` | 2026-05-25 |
| Members templates portal (not entered) | `https://templates.provehicleoutlines.com/members/templates` | 2026-05-25 |

---

## Clause-by-clause findings (verbatim quotes)

All quotes from the EULA at `https://www.provehicleoutlines.com/pvo-eula/`, read 2026-05-25.

### 1. License grant is narrow and conditional
> "FIERY grants you a **limited, non-exclusive license** to use the Software **solely in accordance
> with the terms and conditions of this License Agreement, solely as specified in the FIERY product
> documentation**, and solely with the product(s) specified in the FIERY product documentation."

→ A narrow personal-use grant. It does **not** affirmatively grant commercial redistribution,
sublicensing, or database/catalog rights. Under copyright, rights not granted are reserved.

### 2. Distribution is prohibited
> "you may not rent, lease, sublicense, lend, or **otherwise distribute** the Software or use the
> Software in any time sharing, service bureau, or similar arrangement."

→ Serving PVO-derived outlines to AlphaWolf customers via the product = distribution. **Prohibited.**

### 3. Derivative works are prohibited
> "You agree not to localize, translate, disassemble, decompile, decrypt, reverse engineer,
> unbundle, repackage, discover the source code of, modify, **create derivative works of**, or in
> any way change any part of the Software."

→ The planned `parse-vehicle-svg.ts` pipeline (split the whole-vehicle SVG into named panels, add
wrap-safe zones, precompute surface area) is squarely "creating a derivative work." **Prohibited.**

### 4. All IP — including derivatives — stays with the licensor
> "all rights, title, and interest, including all intellectual property rights, in and relating to
> the Software, all FIERY Products, and **all copies, modifications, and derivative works thereof,
> are solely owned by and shall remain with FIERY and its suppliers.**"

→ Even if a derivative were somehow permitted, its IP would vest in FIERY — the **opposite** of the
"clean chain of title" the vehicle-DB spec §5.3 says the moat depends on.

### 5. Subscription terms imply consumptive, member-only use
From the Subscription & Cancellation Terms (read 2026-05-25): a within-24-hour cancellation gives a
full refund **"unless templates have been downloaded."** → downloads are treated as a consumed
member benefit (use them to produce wraps), not a transferable/redistributable asset.

---

## Ambiguities flagged (conservative reading)

1. **Does "the Software" include the downloadable template/outline files, or only the PVO
   application?** The EULA is written around "the Software" / "FIERY Products." If the outline
   files are *not* "the Software," then **there is no license at all** granting redistribution of
   them — they remain the provider's copyrighted works with no transfer. Either reading blocks the
   ingest: covered → distribution + derivative works prohibited; not covered → no grant + default
   copyright reserved. **Ambiguity does not help us here; it confirms STOP.**
2. **Licensor identity (FIERY vs. Pro Vehicle Outlines).** The EULA reads as a Fiery/EFI agreement.
   Whether PVO templates are licensed under this exact EULA or a separate term is unclear from the
   public page. This must be clarified directly with the provider before any licensed-source path.
3. **No clause expressly addresses bulk download / scraping / database use.** Silence is **not**
   permission — the distribution + derivative-works prohibitions already cover the downstream use,
   and bulk scraping additionally risks breaching site ToS / anti-circumvention terms.

---

## What the license permits vs. does not permit (for this project's purpose)

| Action | Permitted? |
|---|---|
| Member downloads an outline to produce a wrap for a job | ✅ Yes (intended member use) |
| Ingest outlines into AlphaWolf's `db.vehicle` catalog | ⛔ No (distribution) |
| Split/transform outlines into panels + wrap-safe zones | ⛔ No (derivative works) |
| Serve PVO-derived outlines to AlphaWolf customers | ⛔ No (distribution) |
| Claim ownership of the derived panel data | ⛔ No (IP stays with licensor) |
| Resell / sublicense the templates | ⛔ No (explicitly prohibited) |

There is no "permissive with attribution" branch available here — attribution does not cure a
prohibition on distribution and derivative works.

---

## Cross-reference: this contradicts the goal but CONFIRMS the spec

The Goal 1 prompt asked to scrape one vehicle from PVO as a PoC. That request **conflicts with the
project's own authoritative `docs/vehicle-database-spec.md`**, which already forbids it:

- **§1** names **ProVehicleOutlines as a competitor** ("the existing options ... All three are
  visualizers"). The DB is "the moat."
- **§5.1** "All tracings done in-house with a documented tracer, **NOT scraped from copyrighted
  competitor SVGs**."
- **§5.3** "**Do NOT use unlicensed competitor outlines. Strict prohibition. The DB's defensibility
  depends on a clean chain of title.**"
- `activities.md` (2026-05-18 PRD entry): "Proprietary vehicle template DB. ... **Build > license
  for moat.**"

So the correct outcome of Goal 1 is **the gate firing** — proving the license check works and
catching the conflict **before** the multi-day Goal 2 ingest could run against a prohibited source.

---

## Recommendation / pivot options

1. **Do NOT scrape PVO. Do NOT fire Goal 2 against this source.** (Mandatory.)
2. **Primary path — build, per spec §5.1 + §5.2:** trace outlines in-house from *manufacturer*
   4-view technical drawings (clean chain of title) and/or measure in-shop. This is the documented
   strategy and the moat.
3. **If a licensed source is still wanted (spec §5.3):** approach the provider in writing for an
   **explicit commercial-redistribution + derivative-works license** with IP terms that leave the
   derived data with AlphaWolf. Treat this as a contract negotiation, not a membership click-through.
   Clarify the FIERY-vs-PVO licensor question first.
4. **Alternative neutral data:** NHTSA / OEM body-builder spec PDFs for dimensions + in-house
   tracing for outlines (more work, fully clean).

---

## Provenance / reproducibility

- Findings derived from the public EULA, subscription terms, and FAQ pages listed above, read
  2026-05-25 via web fetch. No authenticated session was used; no member content was accessed,
  scraped, or stored.
- Quotes are reproduced from those public pages. If the provider updates the EULA, re-read and
  re-date this document before relying on it.
