"""FastAPI wrapper exposing bounded asynchronous HYSPLIT trajectory job endpoints."""

from collections import OrderedDict
import hashlib
import re
import time
from typing import Any, Dict, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from hysplit import TrajectoryRequest, TrajectoryResult, run_trajectories

DEFAULT_MAX_CACHED_JOBS = 256
JOB_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


class JobCreateRequest(BaseModel):
    """Input payload for submitting an active-fire trajectory job."""

    fireId: str = Field(..., min_length=1, max_length=100)
    lat: float = Field(..., ge=-90.0, le=90.0)
    lon: float = Field(..., ge=-180.0, le=180.0)
    observedAt: str = Field(..., max_length=50)


class JobStatusResponse(BaseModel):
    """Serialized status payload for a HYSPLIT trajectory job."""

    id: str
    state: str  # "queued" | "running" | "complete" | "unavailable"
    reason: Optional[str] = None
    result: Optional[Dict[str, Any]] = None


class BoundedJobCache:
    """Bounded LRU-order in-memory store synchronizing job records and deduplication keys."""

    def __init__(self, max_entries: int = DEFAULT_MAX_CACHED_JOBS) -> None:
        if max_entries < 1:
            raise ValueError("max_entries must be at least 1")
        self._max_entries = max_entries
        self._jobs: OrderedDict[str, Dict[str, Any]] = OrderedDict()
        self._dedupe_index: Dict[str, str] = {}
        self._job_to_dedupe: Dict[str, str] = {}

    def get_by_dedupe_key(self, dedupe_key: str) -> Optional[Dict[str, Any]]:
        """Returns an existing job record for a deduplication key if still cached."""
        job_id = self._dedupe_index.get(dedupe_key)
        if not job_id or job_id not in self._jobs:
            return None
        self._jobs.move_to_end(job_id)
        return self._jobs[job_id]

    def get_by_id(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Returns a cached job record by job ID if present."""
        if job_id not in self._jobs:
            return None
        self._jobs.move_to_end(job_id)
        return self._jobs[job_id]

    def store(self, job_id: str, dedupe_key: str, record: Dict[str, Any]) -> None:
        """Inserts a job record, evicting the oldest entry if capacity is reached."""
        if job_id not in self._jobs and len(self._jobs) >= self._max_entries:
            evicted_id, _ = self._jobs.popitem(last=False)
            evicted_dedupe = self._job_to_dedupe.pop(evicted_id, None)
            if evicted_dedupe and self._dedupe_index.get(evicted_dedupe) == evicted_id:
                self._dedupe_index.pop(evicted_dedupe, None)

        self._jobs[job_id] = record
        self._jobs.move_to_end(job_id)
        self._dedupe_index[dedupe_key] = job_id
        self._job_to_dedupe[job_id] = dedupe_key


def _build_job_record(request: JobCreateRequest) -> Dict[str, Any]:
    """Executes trajectory modeling synchronously and constructs the stored job dictionary."""
    job_id = hashlib.sha256(
        f"{request.fireId}_{request.lat}_{request.lon}_{request.observedAt}_{time.time()}".encode()
    ).hexdigest()[:12]

    trajectory_request = TrajectoryRequest(
        source_lat=request.lat,
        source_lon=request.lon,
        observed_at=request.observedAt,
        start_heights_m=[100, 500, 1000],
        duration_hours=24,
        weather_file_path="/app/weather/current.arl",
    )
    trajectory_result: TrajectoryResult = run_trajectories(trajectory_request)

    if trajectory_result.status == "complete":
        return {
            "id": job_id,
            "state": "complete",
            "reason": None,
            "result": trajectory_result.data,
        }

    return {
        "id": job_id,
        "state": "unavailable",
        "reason": trajectory_result.reason
        or "Atmospheric weather files are unavailable on this host.",
        "result": None,
    }


def create_app(max_jobs: int = DEFAULT_MAX_CACHED_JOBS) -> FastAPI:
    """Creates a configured FastAPI instance with an isolated bounded job cache."""
    fastapi_app = FastAPI(title="HYSPLIT Smoke Trajectory Service")
    job_cache = BoundedJobCache(max_entries=max_jobs)

    @fastapi_app.post("/jobs", response_model=JobStatusResponse)
    def create_job(request: JobCreateRequest) -> JobStatusResponse:
        dedupe_key = f"{request.fireId}_{request.observedAt}"
        existing_record = job_cache.get_by_dedupe_key(dedupe_key)
        if existing_record is not None:
            return JobStatusResponse(**existing_record)

        job_record = _build_job_record(request)
        job_cache.store(job_record["id"], dedupe_key, job_record)
        return JobStatusResponse(**job_record)

    @fastapi_app.get("/jobs/{job_id}", response_model=JobStatusResponse)
    def get_job_status(job_id: str) -> JobStatusResponse:
        if not JOB_ID_PATTERN.match(job_id):
            raise HTTPException(status_code=400, detail="Invalid job ID format")

        cached_record = job_cache.get_by_id(job_id)
        if cached_record is None:
            raise HTTPException(
                status_code=404,
                detail="Job not found or expired from disposable memory cache",
            )
        return JobStatusResponse(**cached_record)

    return fastapi_app


app = create_app()
