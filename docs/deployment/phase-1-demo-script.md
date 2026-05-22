# Phase 1 demo script — Alpha Wolf Wrap Studio

**Duration**: ~2 minutes  
**Environment**: deployed Vercel preview URL (or production)  
**Demonstrator**: Archer  
**Audience**: prospective customers, investors, or internal review

---

## Setup (before the demo — ~2 minutes)

1. Open the deployed URL in a fresh browser window (incognito/private to avoid cached state).
2. Confirm `alphawolf-api` and `alphawolf-parse` Render services are awake (hit their
   `/health` endpoints to trigger cold-start before the demo):
   ```
   curl https://<render-api-url>/health
   curl https://<render-parse-url>/health
   ```
   Wait for `{"status":"ok"}` from each (may take up to 30s on first wake).
3. Have a small PNG or SVG logo file ready (≤ 2MB, square aspect ratio recommended).
4. Optionally: open the Sentry dashboard in another tab to show live error tracking.

---

## The 2-minute walkthrough

### Step 1 — Sign up as shop owner (15s)

1. Navigate to `/signup-shop`
2. Fill in: name, email (`archer@1stimpression.co`), shop name, password
3. Click **Create account**
4. Check email for the OTP → enter it on `/verify`
5. You land on the welcome/dashboard page

> **Talking point**: "New shop owners self-onboard in under 30 seconds — no manual
> provisioning. Each account is isolated at the database level (row-level security),
> so shop A can never see shop B's projects."

---

### Step 2 — Browse the vehicle gallery (15s)

1. Navigate to `/vehicles`
2. Use the search bar to type "Transit" — see the Ford Transit 250 appear
3. Click **Ford Transit 250** to open the vehicle detail page
4. See the three panels: Driver Side, Passenger Side, Rear

> **Talking point**: "The template database ships with print-ready panel geometry,
> precise measurements, and the printable area pre-calculated. No manual measuring."

---

### Step 3 — Start a project (5s)

1. On the vehicle detail page, click **Start project**
2. You're on the project page — see the project created with a default name
3. Click **Open editor** (or the project name)

---

### Step 4 — Upload a logo asset (20s)

1. In the editor, locate the **Upload** button in the asset panel (or the upload area)
2. Click and select your PNG/SVG logo file
3. Watch the upload progress indicator → "Processing…" → "Ready"
4. The asset appears in the asset panel as a thumbnail

> **Talking point**: "Assets are stored in private, encrypted object storage. The upload
> goes browser-direct via a signed URL — the file never passes through our server.
> Background AI processing strips the background automatically using Replicate's rembg."

---

### Step 5 — Toggle background removal (10s)

1. Click the uploaded asset in the panel
2. In the properties area, toggle the **Remove background** switch
3. Watch it update (may take 2–5s for Replicate rembg) — the background disappears

> If rembg is still processing, the original is shown. You can proceed — the toggle
> takes effect once processing completes.

---

### Step 6 — Place on the canvas (15s)

1. Click the driver-side panel to select it in the canvas
2. Click the uploaded logo asset to place it at the panel centre
3. Drag it to position on the panel
4. Use pinch/scroll to zoom if desired

---

### Step 7 — Demonstrate out-of-bounds detection (15s)

1. Drag the logo outside the panel boundary (past the red dashed outline)
2. See the red out-of-bounds cue appear with the warning triangle icon
3. A screen-reader announcement fires (visible in the DOM live region)
4. Drag it back inside the panel — cue disappears

> **Talking point**: "The editor enforces the printable area in real time. A shop
> worker can't accidentally design something that bleeds into the non-printable edge."

---

### Step 8 — Undo / Redo (10s)

1. Press `Cmd+Z` (Mac) / `Ctrl+Z` (Windows) — logo returns to previous position
2. Press `Cmd+Shift+Z` (or `Cmd+Y`) — redo restores it
3. Try `Cmd+A` — selects all elements on the current panel

---

### Step 9 — Save and reload (15s)

1. The autosave indicator in the toolbar shows "Saving…" then "Saved"
2. Close the tab
3. Navigate back to `/projects` — the project is listed
4. Click the project → Open editor → **canvas state is intact**

> **Talking point**: "Autosave runs every 1.5 seconds of inactivity, max 10 seconds.
> The state survives a tab crash, a reload, and a browser restart."

---

## Known Phase 1 limitations (mention if asked)

| Limitation                     | Status                                                        | Timeline                               |
| ------------------------------ | ------------------------------------------------------------- | -------------------------------------- |
| AI generation from text        | Not yet                                                       | Phase 2                                |
| Print panel export             | Not yet                                                       | Phase 3                                |
| Multi-panel layout in one view | Not yet                                                       | Phase 2                                |
| Mobile / tablet support        | Not yet                                                       | Phase 4                                |
| AI/EPS/PDF asset conversion    | Render free-tier: `queued_missing_cli` (graceful degradation) | Phase 4 (Docker service with inkscape) |
| Custom domain                  | Using `.vercel.app` for now                                   | Phase 4                                |
| OTP email to arbitrary inboxes | Sandbox sender only delivers to `archer@1stimpression.co`     | Phase 4 (domain verification)          |

---

## Troubleshooting the demo

| Symptom                                      | Fix                                                                                      |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `/health` on Render returns 502 or times out | Service is spinning down; wait 30s, retry                                                |
| OTP email never arrives                      | Check Resend sandbox; OTP only delivers to `archer@1stimpression.co`                     |
| Canvas doesn't load                          | Check browser console for a Konva error; ensure the project has a valid vehicle template |
| Asset stays "Processing…"                    | Check Render parse worker logs; rembg via Replicate may be cold-starting                 |
| Upload fails with 413                        | File exceeds 20MB limit; use a smaller asset                                             |

---

## Demo URL

Record here after first successful Vercel deployment:

```
Demo URL: https://_____________________________.vercel.app
Deployed: ______________________________ (date)
Commit:   ______________________________ (git SHA)
```
