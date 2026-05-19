#!/usr/bin/env bash
# Alpha Wolf Wrap Studio — bulk GitHub issue seeding
# Creates one issue per user story (GH-001 … GH-022) defined in prd.md.
#
# Prereq: `gh` CLI installed and authenticated (`gh auth status`).
# Run from inside the repo, or pass --repo. Example:
#   chmod +x scripts/create-github-issues.sh
#   ./scripts/create-github-issues.sh
#
# Idempotency: re-running creates duplicate issues. Run once. To recover from a
# partial run, comment out the create_issue calls that already succeeded.

set -euo pipefail

REPO="archerverified/alphawolfedecals-app"
PRD_LINK="https://github.com/${REPO}/blob/main/prd.md"

# --- Ensure labels exist (no-ops if present) -----------------------------------
echo "Ensuring labels exist on ${REPO}..."
for label in phase-1 phase-2 phase-3 phase-4 phase-5 phase-6 auth infra ai editor vehicle-db export print-paneling security ux activity-log; do
  gh label create "$label" --repo "$REPO" --force >/dev/null 2>&1 || true
done

create_issue() {
  local id="$1"
  local title="$2"
  local body="$3"
  shift 3
  local labels=("$@")
  local label_args=()
  for l in "${labels[@]}"; do label_args+=(--label "$l"); done

  echo "Creating ${id}: ${title}"
  gh issue create \
    --repo "$REPO" \
    --title "[${id}] ${title}" \
    --body "${body}" \
    "${label_args[@]}"
}

# --- GH-001 -------------------------------------------------------------------
create_issue "GH-001" "Customer signup with email verification" "$(cat <<'EOF'
**Description**
As a prospective customer, I want to sign up with my email and verify via OTP so that I can save designs to my account.

**Acceptance criteria**
- [ ] Signup form collects first name, last name, email, password, account type.
- [ ] Password rules: ≥12 chars, ≥1 number, ≥1 symbol, ≥1 letter. Strength meter shown.
- [ ] On submit, account is created in `pending_verification` state and an OTP email is sent within 5 seconds.
- [ ] OTP is a 6-digit code with 10-minute expiry; entering correctly transitions account to `active`.
- [ ] Wrong code shows error, allows retry up to 5 attempts in 15 minutes before lockout.
- [ ] Resend code button enabled after 30 seconds; rate-limited to 5 sends per email per hour.
- [ ] On success, user lands on vehicle selector with their account scoped to `customer` type.

**Dependencies:** None
**Phase:** 1
**Source PRD:** §10.1
EOF
)" phase-1 auth

# --- GH-002 -------------------------------------------------------------------
create_issue "GH-002" "Shop signup with org creation" "$(cat <<'EOF'
**Description**
As a wrap shop owner, I want to create a shop account so that my team can collaborate and our printer setup is saved once.

**Acceptance criteria**
- [ ] Signup collects first/last name, email, password, company name, phone (required), business address, website (optional).
- [ ] Creates `user` record + `shop` record + `membership` with role `shop_admin` in a single transaction.
- [ ] Forces email OTP verification before shop becomes active.
- [ ] On success, lands user on printer/media setup wizard (skippable but flagged).

**Dependencies:** GH-001
**Phase:** 1
**Source PRD:** §10.2
EOF
)" phase-1 auth

# --- GH-003 -------------------------------------------------------------------
create_issue "GH-003" "Vehicle template browse and select" "$(cat <<'EOF'
**Description**
As any user, I want to pick my exact vehicle from a year/make/model selector with body-type-specific facets so that the design starts on an accurate outline.

**Acceptance criteria**
- [ ] Cascade selector: Year (1990–current year) → Make → Model → Trim. Each level loads in <200ms on cached data.
- [ ] Free-text search box matches across all fields with typo tolerance ("transt 250" → Transit 250).
- [ ] Selecting a truck reveals cab + bed size facets; selecting a van reveals wheelbase + roof height + length.
- [ ] Each match displays the 4-view outline preview, dimensions, and "use this template" CTA.
- [ ] "Request this vehicle" form appears after 2 refinements or via explicit CTA.
- [ ] Customer accounts limited to 3 saved vehicles; Shop accounts unlimited.

**Dependencies:** None
**Phase:** 1
**Source PRD:** §10.3
EOF
)" phase-1 vehicle-db

# --- GH-004 -------------------------------------------------------------------
create_issue "GH-004" "Internal admin vehicle template CRUD" "$(cat <<'EOF'
**Description**
As an internal Alpha Wolf admin, I want to create, edit, version, and approve vehicle templates so that the library can grow accurately.

**Acceptance criteria**
- [ ] Admin-only route at `/admin/vehicles` (role-gated; non-admins get 404).
- [ ] Create form accepts year/make/model/trim/variant, dimensions, body type facets, SVG upload.
- [ ] SVG upload validated for 4 views (front/back/driver/passenger), wrap-safe zones as named paths, no embedded raster >500KB.
- [ ] Versioning: edits create a new version; live version explicitly published; older versions remain accessible for projects using them.
- [ ] "Request this vehicle" entries surface as a queue with status (Pending / In Progress / Shipped / Rejected).

**Dependencies:** GH-003
**Phase:** 1
**Source PRD:** §10.4
EOF
)" phase-1 vehicle-db

# --- GH-005 -------------------------------------------------------------------
create_issue "GH-005" "Asset upload with vector parsing" "$(cat <<'EOF'
**Description**
As a user, I want to upload my logo in AI/EPS/PDF/SVG/PNG/JPG and have it parsed into a usable asset so that I don't have to convert formats manually.

**Acceptance criteria**
- [ ] Accepts AI, EPS, PDF, SVG, PNG, JPG, HEIC. Rejects others with clear message.
- [ ] Max file size 50MB; client + server enforcement.
- [ ] Vector formats parsed server-side via Inkscape; preview PNG returned within 10 seconds for files <10MB.
- [ ] Detected bounding box shown; user can adjust crop with handles.
- [ ] "Remove background" toggle calls rembg; preview before commit.
- [ ] Failed uploads queue locally and retry on next foreground with network.
- [ ] Asset persists in project asset library; reusable across versions.

**Dependencies:** None
**Phase:** 1
**Source PRD:** §10.5
EOF
)" phase-1 editor

# --- GH-006 -------------------------------------------------------------------
create_issue "GH-006" "Initial AI design generation" "$(cat <<'EOF'
**Description**
As a customer, I want to generate four photoreal wrap mockups for my vehicle by picking a style and writing a short prompt so that I can see options without learning Illustrator.

**Acceptance criteria**
- [ ] Requires selected vehicle template, ≥1 brand asset, style preset chip.
- [ ] Optional free-text prompt up to 500 chars.
- [ ] Submit triggers background job; UI shows step-labelled progress.
- [ ] p95 end-to-end <90s; hard timeout at 180s with retry prompt.
- [ ] Output: 4 mockup variants in a 4-up grid; each downloadable and selectable as base for further iteration.
- [ ] Cost logged to `generations` table with model, prompt, output asset IDs, dollar cost.
- [ ] Customer daily limit: 30 generations; counter visible; blocks at limit with reset-time copy.
- [ ] PDFs carry provenance signature ("Generated with Alpha Wolf Wrap Studio · Model: <name> · <timestamp>").

**Dependencies:** GH-003, GH-005
**Phase:** 2
**Source PRD:** §10.6
EOF
)" phase-2 ai

# --- GH-007 -------------------------------------------------------------------
create_issue "GH-007" "Natural-language design tweaks" "$(cat <<'EOF'
**Description**
As a user, I want to refine a generated design by typing natural-language instructions so that I can iterate without using design tools.

**Acceptance criteria**
- [ ] Tweak field enabled on any generated variant; max 500 chars per tweak.
- [ ] Submitting routes the variant + tweak through Claude for prompt enrichment, then to the image model.
- [ ] Tweak preserves layer structure where possible; full regenerations are flagged with a warning.
- [ ] Each tweak counts against the daily generation quota.
- [ ] Tweak history shown as a vertical thread under the variant.

**Dependencies:** GH-006
**Phase:** 2
**Source PRD:** §10.7
EOF
)" phase-2 ai

# --- GH-008 -------------------------------------------------------------------
create_issue "GH-008" "Canvas editor with per-panel masking" "$(cat <<'EOF'
**Description**
As a designer, I want to edit a wrap on a canvas where each vehicle body panel is its own editable region and artwork cannot accidentally extend outside the printable area.

**Acceptance criteria**
- [ ] Vehicle SVG renders with each body panel as a discrete layer.
- [ ] Tools: text, shape, image (raster + vector), color fill, gradient, opacity, finish swatch.
- [ ] Snap to body line, panel edge, vehicle centerline, other elements; toggleable.
- [ ] Per-panel wrap mask enforced — artwork outside printable area shows hard visual cue and clips on render.
- [ ] Undo/redo with 50-step history; persisted across page reloads.
- [ ] Canvas maintains 60fps with up to 200 layers on a 2021 M1 MacBook baseline.

**Dependencies:** GH-003
**Phase:** 1 (base editor); AI variant ingestion via GH-006/GH-007 in Phase 2
**Source PRD:** §10.8
EOF
)" phase-1 editor

# --- GH-009 -------------------------------------------------------------------
create_issue "GH-009" "Shop printer and media setup" "$(cat <<'EOF'
**Description**
As a shop admin, I want to configure my printer model, media width, laminate width, overlap, and panel direction once so that exports are automatically correct.

**Acceptance criteria**
- [ ] Setup wizard surfaces on first shop login (skippable but persistently flagged).
- [ ] Fields: printer model (preset list + Other), media width (in, 0.25" steps), laminate width, default overlap (default 0.5"), panel direction, default bleed (default 0.25").
- [ ] Multiple printer profiles per shop; one default.
- [ ] Settings version-stamped on each export for reproducibility.

**Dependencies:** GH-002
**Phase:** 3
**Source PRD:** §10.9
EOF
)" phase-3 print-paneling

# --- GH-010 -------------------------------------------------------------------
create_issue "GH-010" "Automatic print paneling" "$(cat <<'EOF'
**Description**
As a shop designer, I want to export a wrap and have the system automatically panel it for my printer with correct bleeds, overlaps, seam alignment, and labels.

**Acceptance criteria**
- [ ] Triggered from project → Export → Production Package.
- [ ] Uses shop default printer profile unless overridden.
- [ ] Slices the wrap at (media_width − overlap) intervals.
- [ ] Adds bleed to all 4 sides per panel.
- [ ] Aligns panel seams to body panel breaks where geometry is within 2" of a media-width interval.
- [ ] Labels each panel: vehicle area name, "Panel N of M", install-direction arrow.
- [ ] Outputs multi-page PDF: cover sheet with panel map, then one page per panel at 1:1.
- [ ] Validation pre-flight blocks export on bleed underflow, panel > media width, missing wrap-safe data, raster <150 DPI at final size.
- [ ] Generates in <30s (p95) for a full vehicle wrap.

**Dependencies:** GH-008, GH-009
**Phase:** 3
**Source PRD:** §10.10
EOF
)" phase-3 print-paneling export

# --- GH-011 -------------------------------------------------------------------
create_issue "GH-011" "Detailed export with full metadata" "$(cat <<'EOF'
**Description**
As any user, I want the exported PDF to include a comprehensive metadata block on the cover sheet so that the document is a self-contained record of the job.

**Acceptance criteria**
- [ ] Cover sheet contains four labelled sections: Vehicle, Design, Print Production, Project Tracking (per PRD §4.8).
- [ ] All metadata also embedded as PDF/X structured data.
- [ ] Color palette section shows HEX, RGB, and closest Pantone (PMS) for every brand color used.
- [ ] Wrap coverage % calculated from total wrap surface area / total vehicle surface area (whole percent).
- [ ] Project Tracking section reflects current project state (status, version, dates, names).
- [ ] AI provenance signature in PDF footer.

**Dependencies:** GH-010
**Phase:** 3
**Source PRD:** §10.11
EOF
)" phase-3 export

# --- GH-012 -------------------------------------------------------------------
create_issue "GH-012" "Project handoff via token" "$(cat <<'EOF'
**Description**
As a customer, I want to hand my finished design off to a shop using a one-time code so that the shop receives the full project without me re-uploading anything.

**Acceptance criteria**
- [ ] "Send to a shop" → pick Alpha Wolf Decals (default) or enter a 12-char shop code.
- [ ] Generates single-use token tied to project; emails shop admin.
- [ ] Shop accepts → project mirrored into shop workspace with full version history + assets; shop becomes editor.
- [ ] Customer retains read access; can comment but not edit.
- [ ] Reversible by mutual approval within 7 days; afterward requires support.
- [ ] Audit logged in `project_activities` with timestamp + actor.

**Dependencies:** GH-002, GH-003, GH-006
**Phase:** 4
**Source PRD:** §10.12
EOF
)" phase-4 ux

# --- GH-013 -------------------------------------------------------------------
create_issue "GH-013" "Project activities log" "$(cat <<'EOF'
**Description**
As any user, I want every meaningful action on a project recorded in a human-readable timeline so that the history is auditable.

**Acceptance criteria**
- [ ] Events written on every AI generation, manual edit committed, comment, approval state change, export.
- [ ] Timeline UI shows reverse-chronological events with actor, action, timestamp.
- [ ] Exportable as `activities.md` markdown file from project menu.
- [ ] Exported markdown matches the same schema as the repo-level `activities.md` (PRD §11.7).
- [ ] Append-only; corrections are new entries.

**Dependencies:** GH-001, GH-006, GH-008, GH-010
**Phase:** 3
**Source PRD:** §10.13
EOF
)" phase-3 activity-log

# --- GH-014 -------------------------------------------------------------------
create_issue "GH-014" "Material and labor estimator on export" "$(cat <<'EOF'
**Description**
As a shop, I want the production package to include a material and labor estimate based on my pricing so that I can quote off the same document.

**Acceptance criteria**
- [ ] Shop sets per-foot vinyl, per-sqft laminate, hourly labor rate in printer profile.
- [ ] Export auto-calculates total linear feet, total sqft, estimated install hours (vehicle-type heuristic), dollar line items + total.
- [ ] Estimate on its own page in Production Package PDF; also exportable as standalone CSV.

**Dependencies:** GH-009, GH-010, GH-011
**Phase:** 5
**Source PRD:** §10.14
EOF
)" phase-5 export

# --- GH-015 -------------------------------------------------------------------
create_issue "GH-015" "Approval workflow" "$(cat <<'EOF'
**Description**
As a shop, I want to send a version for customer approval and have the customer approve or request changes in-app so that we have a clear sign-off record.

**Acceptance criteria**
- [ ] "Send for Approval" button per version sets state `pending_approval`; locks edits.
- [ ] Customer receives email + in-app notification.
- [ ] Customer can approve (state `approved`), request changes (state `changes_requested` with required comment), or take no action (no expiry in v1).
- [ ] Approval state visible on project header; recorded in activities log.
- [ ] Approved versions immutable; further edits fork a new version.

**Dependencies:** GH-012, GH-013
**Phase:** 4
**Source PRD:** §10.15
EOF
)" phase-4 ux

# --- GH-016 -------------------------------------------------------------------
create_issue "GH-016" "Email + in-app notifications" "$(cat <<'EOF'
**Description**
As a user, I want to receive email and in-app notifications for actions that need my attention so that I don't have to keep checking the app.

**Acceptance criteria**
- [ ] Notifications on handoff received, approval requested, approval granted, changes requested, mention, AI generation complete (when user has navigated away).
- [ ] Email via Resend; in-app via bell icon with unread badge.
- [ ] Per-event-type preference: email / in-app / both / none.
- [ ] Email templates score >9/10 on Mail Tester, include unsubscribe link, pass SPF/DKIM/DMARC.

**Dependencies:** GH-001
**Phase:** 4
**Source PRD:** §10.16
EOF
)" phase-4 infra

# --- GH-017 -------------------------------------------------------------------
create_issue "GH-017" "Vehicle template request loop" "$(cat <<'EOF'
**Description**
As a user, I want to request a vehicle that isn't in the database and receive an email when the template ships so that I can come back and design.

**Acceptance criteria**
- [ ] "Request this vehicle" form collects year/make/model/trim plus optional reference photos.
- [ ] Submission creates admin queue record with submitter email.
- [ ] On admin marking "Shipped", system emails submitter with deep link into the new template.
- [ ] User can opt out of follow-up emails.

**Dependencies:** GH-003, GH-004
**Phase:** 4
**Source PRD:** §10.17
EOF
)" phase-4 vehicle-db

# --- GH-018 -------------------------------------------------------------------
create_issue "GH-018" "Generation cost dashboard for shops" "$(cat <<'EOF'
**Description**
As a shop admin, I want a dashboard showing my AI generation usage and cost by day, project, and team member so that I can manage spend.

**Acceptance criteria**
- [ ] Dashboard at `/shop/{id}/usage` shows total generations + cost this month, daily trend chart, top 10 projects by cost, breakdown by team member.
- [ ] Data fresh within 5 minutes of generation completion.
- [ ] Exportable as CSV.

**Dependencies:** GH-006
**Phase:** 4
**Source PRD:** §10.18
EOF
)" phase-4 ai

# --- GH-019 -------------------------------------------------------------------
create_issue "GH-019" "Account deletion (GDPR)" "$(cat <<'EOF'
**Description**
As a user, I want to permanently delete my account and have my personal data removed so that I can exercise my data rights.

**Acceptance criteria**
- [ ] Settings → Delete Account with double-confirmation and password re-entry.
- [ ] On confirm: login disabled immediately, soft-deleted projects scheduled for hard delete in 7 days.
- [ ] All PII (name, email, phone, address, VIN) hard-deleted within 7 days; project records anonymized.
- [ ] User receives confirmation email immediately + final deletion-complete email at 7 days.
- [ ] Shops can request export of account data before deletion; delivered as zip within 24 hours.

**Dependencies:** GH-001
**Phase:** 4
**Source PRD:** §10.19
EOF
)" phase-4 security

# --- GH-020 -------------------------------------------------------------------
create_issue "GH-020" "Security: auth and session hardening" "$(cat <<'EOF'
**Description**
As the platform, I want auth and sessions hardened against common attacks so that customer and shop accounts cannot be trivially compromised.

**Acceptance criteria**
- [ ] Sessions in httpOnly, Secure, SameSite=strict cookies.
- [ ] CSRF tokens on all state-changing routes.
- [ ] Password hashing via argon2id (m=64MB, t=3, p=4).
- [ ] Rate-limit: 5 failed logins / IP / 15 min → lockout with backoff; per-account lockout after 10 failures.
- [ ] All auth events logged (login, logout, failed login, password reset, OTP request, OTP success).
- [ ] Pen-test pass before public launch; OWASP Top 10 reviewed and documented.

**Dependencies:** GH-001, GH-002
**Phase:** 4
**Source PRD:** §10.20
EOF
)" phase-4 security auth

# --- GH-021 -------------------------------------------------------------------
create_issue "GH-021" "Comment threads on projects and versions" "$(cat <<'EOF'
**Description**
As any user with access to a project, I want to leave comments on a project or a specific version so that handoff, approval, and refinement happen in one place instead of email.

**Acceptance criteria**
- [ ] Comment field at project level and per version.
- [ ] @mentions of other project users; mention generates a notification (GH-016).
- [ ] Comments immutable once posted; editing creates "edited" badge with diff on hover.
- [ ] Customer + shop see same thread; visibility project-scoped, not role-gated.
- [ ] Comments captured in activities log (GH-013).

**Dependencies:** GH-012, GH-016
**Phase:** 4
**Source PRD:** §10.21
EOF
)" phase-4 ux

# --- GH-022 -------------------------------------------------------------------
create_issue "GH-022" "Asset upload IP acknowledgement" "$(cat <<'EOF'
**Description**
As the platform, I want users to acknowledge they have rights to upload any brand asset so that we have a defensible IP posture and a takedown workflow.

**Acceptance criteria**
- [ ] First brand asset upload per account triggers one-time modal: "I confirm I have rights to use this artwork in commercial vehicle wraps."
- [ ] Acknowledgement recorded with timestamp + asset reference; persisted in audit log.
- [ ] ToS link surfaced in the modal.
- [ ] Takedown form linked from export footer; routes to internal admin queue.

**Dependencies:** GH-005
**Phase:** 4
**Source PRD:** §10.22
EOF
)" phase-4 security

echo ""
echo "Done. Review the issues at: https://github.com/${REPO}/issues"
