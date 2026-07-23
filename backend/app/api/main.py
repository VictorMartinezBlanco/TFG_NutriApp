"""FastAPI application exposing the deterministic plan pipeline.

Wraps the pure solver and validator behind HTTP. The pool is opened once on
startup and closed on shutdown; each request borrows a connection. Calls are
authenticated with a shared token, since the backend runs with a trusted role
and must know which nutritionist it acts for.
"""

from __future__ import annotations

import contextlib

from fastapi import Depends, FastAPI, Header, HTTPException, Path
from fastapi.responses import JSONResponse

from app.config import settings
from app.db import close_pool, get_pool

from . import service
from .schemas import (
    EnqueueRequest,
    EnqueueResponse,
    FeasibleResponse,
    GenerateRequest,
    InfeasibleResponse,
    SignResponse,
)
from .persistence import client_belongs_to, enqueue_task, sign_plan


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    await get_pool()
    try:
        yield
    finally:
        await close_pool()


app = FastAPI(title="NutriApp plan API", lifespan=lifespan)


def require_token(authorization: str = Header(default="")) -> None:
    """Reject calls without the shared bearer token."""
    expected = settings.api_token
    if not expected:
        raise HTTPException(status_code=503, detail="API token not configured.")
    if authorization != f"Bearer {expected}":
        raise HTTPException(status_code=401, detail="Invalid or missing token.")


@app.get("/health")
async def health() -> dict[str, str]:
    """Liveness plus a cheap probe that the database is reachable from the host."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.fetchval("SELECT 1")
    return {"status": "ok"}


@app.post("/plans/generate")
async def generate_plan_endpoint(
    req: GenerateRequest, _: None = Depends(require_token)
) -> FeasibleResponse | InfeasibleResponse:
    pool = await get_pool()
    async with pool.acquire() as conn:
        try:
            return await service.generate(conn, req)
        except service.Forbidden as e:
            raise HTTPException(status_code=403, detail=str(e))
        except service.BadRequest as e:
            raise HTTPException(status_code=400, detail=str(e))
        except service.Unprocessable as e:
            raise HTTPException(status_code=422, detail=str(e))


@app.post("/generation-tasks")
async def enqueue_task_endpoint(
    req: EnqueueRequest, _: None = Depends(require_token)
) -> EnqueueResponse:
    """Drop a task on the queue and return at once. The local worker does the
    work; polling reads the row's state directly under RLS."""
    if req.kind == "generate" and not req.input_text and not req.constraints:
        raise HTTPException(
            status_code=400, detail="A generation needs free text or constraints."
        )
    pool = await get_pool()
    async with pool.acquire() as conn:
        if not await client_belongs_to(conn, req.client_id, req.nutritionist_id):
            raise HTTPException(
                status_code=403, detail="The client does not belong to this nutritionist."
            )
        task_id = await enqueue_task(
            conn,
            req.nutritionist_id,
            req.client_id,
            req.kind,
            req.input_text,
            [c.model_dump() for c in req.constraints],
            req.duration_days,
            req.meals_per_day,
        )
    return EnqueueResponse(task_id=task_id)


@app.post("/plans/{plan_id}/sign")
async def sign_plan_endpoint(
    req: dict, plan_id: int = Path(ge=1), _: None = Depends(require_token)
) -> SignResponse:
    nutritionist_id = str(req.get("nutritionist_id", "")).strip()
    if not nutritionist_id:
        raise HTTPException(status_code=400, detail="nutritionist_id is required.")
    pool = await get_pool()
    async with pool.acquire() as conn:
        try:
            status, approved_at = await sign_plan(conn, plan_id, nutritionist_id)
        except LookupError as e:
            raise HTTPException(status_code=404, detail=str(e))
    return SignResponse(plan_id=plan_id, status=status, approved_at=approved_at)


@app.exception_handler(Exception)
async def _unhandled(request, exc):
    """Any unexpected failure surfaces as a 500 with a generic body."""
    return JSONResponse(status_code=500, content={"detail": "Internal solver error."})
