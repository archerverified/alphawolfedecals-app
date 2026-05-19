from fastapi import FastAPI

app = FastAPI(title="alphawolf-ai", version="0.0.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "ai"}
