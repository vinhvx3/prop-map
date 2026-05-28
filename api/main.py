"""
PropMap FastAPI app — Phase 1
"""
from __future__ import annotations
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from api.routers import apartments_router, sessions_router

app = FastAPI(
    title="PropMap API",
    description="Bản đồ chung cư + feed cho thuê TP.HCM",
    version="1.0.0",
)

# CORS — cho phép frontend dev server (Vite port 5173)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(apartments_router)
app.include_router(sessions_router)


@app.on_event("startup")
def on_startup():
    from db.database import init_db
    init_db()


@app.get("/api/v1/health")
def health():
    return {"status": "ok", "version": "1.0.0"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api.main:app", host="0.0.0.0", port=8000, reload=True)
