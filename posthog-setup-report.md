<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog into the AlphaWolf AI service (`services/ai`). The FastAPI app now initializes a `Posthog` client instance on startup via the lifespan context manager, captures operational events, enables automatic exception tracking, and flushes all buffered events on shutdown. Environment variables are read via Pydantic Settings — no credentials are hardcoded.

## Changes made

| File                         | Change                                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------- |
| `services/ai/app/main.py`    | Added PostHog client init, `Settings` class, lifespan startup/shutdown, event captures |
| `services/ai/pyproject.toml` | Added `posthog>=3.0.0` and `pydantic-settings>=2.0.0` to dependencies                  |
| `services/ai/.env`           | Created with `POSTHOG_API_KEY` and `POSTHOG_HOST` (gitignore-covered)                  |

## Events instrumented

| Event name           | Description                                                                      | File                      |
| -------------------- | -------------------------------------------------------------------------------- | ------------------------- |
| `ai service started` | Fired in the FastAPI lifespan startup handler; tracks service boots and restarts | `services/ai/app/main.py` |
| `ai health checked`  | Fired on each `GET /health` request; monitors health-check polling volume        | `services/ai/app/main.py` |

## Next steps

We've built a dashboard and insights for you to keep an eye on AI service operational health:

- [Analytics basics dashboard](/dashboard/1611752)
- [AI Service Starts (Last 30 days)](/insights/m4qXF3wx) — line chart of service restarts/deployments
- [Health Check Volume (Last 30 days)](/insights/txW9pMew) — line chart of health-check polling frequency
- [Total Service Starts (All Time)](/insights/VoCS562y) — bold number showing cumulative starts

As the AI service gains new endpoints (AI generation, inference routes, etc.), add `posthog_client.capture()` calls with the user's `distinct_id` from the `X-POSTHOG-DISTINCT-ID` header to correlate server-side events with the frontend session.

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
