import atexit
from contextlib import asynccontextmanager
from functools import lru_cache

from fastapi import FastAPI
from posthog import Posthog
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    posthog_api_key: str = ""
    posthog_host: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()


def get_posthog() -> Posthog:
    settings = get_settings()
    # CI-safe: when no key is configured (CI, local without secrets) the client is
    # `disabled`, so every capture() is a no-op — no network, no init assertion.
    client = Posthog(
        settings.posthog_api_key or "phc_disabled_placeholder",
        host=settings.posthog_host or "https://us.i.posthog.com",
        enable_exception_autocapture=True,
        disabled=not settings.posthog_api_key,
    )
    atexit.register(client.shutdown)
    return client


posthog_client = get_posthog()


@asynccontextmanager
async def lifespan(app: FastAPI):
    posthog_client.capture(
        "alphawolf-ai",
        "ai service started",
        properties={"$process_person_profile": False},
    )
    yield
    posthog_client.flush()


app = FastAPI(title="alphawolf-ai", version="0.0.0", lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, str]:
    posthog_client.capture(
        "alphawolf-ai",
        "ai health checked",
        properties={"$process_person_profile": False},
    )
    return {"status": "ok", "service": "ai"}
