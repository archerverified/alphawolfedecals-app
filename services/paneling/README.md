# services/paneling

Python 3.12 + FastAPI service for print paneling and PDF composition (PRD §4.6, §4.8).

**Status:** Stub. Only `/health` is implemented. Real paneling lands in Phase 2/3.

See **ADR-0001** for stack rationale.

## Setup (uv)

```bash
cd services/paneling
uv sync                 # installs deps from uv.lock into .venv
uv run uvicorn app.main:app --reload --port 4003
```

## Scripts

```bash
uv run ruff check .
uv run ruff format --check .
uv run pytest -q
```
