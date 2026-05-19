# ADR-0003: services/parse is a Node worker (Sharp + svgo + Inkscape CLI + pdf2svg CLI + rembg via Replicate)

- **Status**: Accepted
- **Date**: 2026-05-18
- **Deciders**: Archer
- **Related stories**: GH-006 (asset upload + parsing), Phase 1 Step 5
- **Supersedes**: Amends ADR-0001 (Python-only stance on backend services)

## Context

ADR-0001 stated _"AI + heavy-compute services"_ would be Python. That covered
two distinct workloads — AI orchestration and print paneling — and implied
that everything heavy would live in Python. Asset parsing (raster/vector
ingest, SVG sanitization, PDF flattening, background removal) is a third
distinct workload that arrives in Phase 1 Step 5, before the AI and paneling
services are exercised.

The parse workload's dominant ecosystem is **Node**, not Python:

- **Sharp** (libvips bindings) is the de facto best raster pipeline in any
  language, and its Node bindings are the canonical surface.
- **svgo** is a Node tool by origin; the Python alternatives (scour) are
  unmaintained.
- **Inkscape** and **pdf2svg** are invoked as CLI subprocesses regardless of
  host language — language choice is irrelevant for them.
- **rembg** has good Python bindings but a self-hosted GPU is overkill for v1;
  we'll call it through the **Replicate** API, which is HTTP-only.

Building this in Python would require either re-implementing Sharp-quality
raster handling in Pillow (slower, worse quality) or shelling out to
Sharp-via-node from a Python parent, which is operational tax for no benefit.

We make this an ADR rather than a silent choice because ADR-0001's text
("Python 3.12 with FastAPI" for the heavy-compute services) could be read as
_all_ worker services going Python, and a future contributor needs to know
why this one didn't.

## Decision

`services/parse` is a **Node 22 + Express + TypeScript** worker. Its
dependencies are:

- **Sharp** for raster reads/writes/resizes/format conversions
- **svgo** for SVG sanitization (strip metadata, remove unused defs)
- **Inkscape** CLI (invoked via `child_process`) for SVG → PDF, AI/EPS → SVG
- **pdf2svg** CLI for PDF → SVG single-page extraction
- **rembg via Replicate API** (`REPLICATE_API_TOKEN`) for background removal
- **bullmq** for consuming jobs from the shared `parse` queue (declared in
  `apps/api/src/queue/queues.ts`)

System CLIs (Inkscape, pdf2svg) are provisioned in the deployment image; the
deployment ADR will record the base image. In CI they are stubbed by mocking
the `child_process` calls.

The service exposes a `/health` endpoint for load-balancer probes. It does
**not** expose business endpoints — work flows in through BullMQ only — to
preserve the trust boundary at `apps/api`.

The AI orchestration and print-paneling services remain Python per ADR-0001:
their workloads (LLM prompt orchestration; geometry + PDF/X composition via
Shapely + ReportLab) are squarely in Python's strongest ecosystem.

## Alternatives considered

- **Python services/parse**: would force Pillow over Sharp (quality regression)
  or a Node sidecar (operational tax). Rejected.
- **Co-locate parsing inside `apps/api`**: a long-running CPU-bound job inside
  the API process blocks the event loop and breaks horizontal scaling. The
  whole point of BullMQ workers is to keep this off the API hot path.
- **Self-host rembg on a GPU**: cheaper per call at high volume, but v1 volume
  doesn't justify the operational overhead. Replicate's per-call billing
  matches Phase 1 traffic shape.
- **Replace Inkscape with a pure-JS SVG parser**: tempting (no system
  dependency), but Inkscape correctly handles malformed customer-supplied
  vectors that pure-JS libraries silently mangle.

## Consequences

**Positive**

- Best-in-class raster (Sharp) and SVG (svgo) tooling with no language
  bridges.
- Parse workers share the `@alphawolf/db` Prisma client and the BullMQ wiring
  with `apps/api`, reducing duplication.
- TypeScript end-to-end across the Node side means asset metadata types
  (uploaded SVG shape, derived PNG metadata) are shared without a generator.

**Negative**

- The repo now has three languages on the backend (TS in apps/api +
  services/parse, Python in services/ai + services/paneling). Two CI pipelines
  was already accepted in ADR-0001; this doesn't add a third.
- System CLI dependencies (Inkscape, pdf2svg) make the deployment image
  larger and add a non-Node failure mode to monitor. Mitigated by pinning
  versions in the Dockerfile and smoke-testing on container start.

**Follow-ups**

- Step 5 lands the actual parse pipeline: Sharp + svgo + Inkscape + pdf2svg
  invocations, Replicate client, job schemas, and parser-output Prisma models.
- Deployment ADR (later) records the base image with Inkscape + pdf2svg
  preinstalled.
- A `services/parse/scripts/smoke-clis.sh` runs on container start to fail
  fast if Inkscape or pdf2svg aren't on PATH.

## References

- /docs/adr/0001-locked-stack.md (amended)
- /prd.md §4.5 (asset ingest), §4.6 (paneling)
- [Sharp](https://sharp.pixelplumbing.com)
- [svgo](https://github.com/svg/svgo)
- [Inkscape command line](https://inkscape.org/doc/inkscape-man.html)
- [pdf2svg](https://github.com/dawbarton/pdf2svg)
- [rembg on Replicate](https://replicate.com/cjwbw/rembg)
