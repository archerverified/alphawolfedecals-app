# services/ai

Python 3.12 + FastAPI service for AI orchestration (Claude prompts, model routing via OpenRouter).

**Status:** Stub. Only `/health` is implemented. Real generation logic lands in Phase 2.

See **ADR-0001** for stack rationale.

## Setup (uv)

```bash
cd services/ai
uv sync                 # installs deps from uv.lock into .venv
uv run uvicorn app.main:app --reload --port 4002
```

## Scripts

```bash
uv run ruff check .
uv run ruff format --check .
uv run pytest -q
```
