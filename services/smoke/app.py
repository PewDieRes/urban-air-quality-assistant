import hashlib
import time
from typing import Dict, Any, Optional
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from hysplit import TrajectoryRequest, run_trajectories, TrajectoryResult


class JobCreateRequest(BaseModel):
  fireId: str
  lat: float
  lon: float
  observedAt: str


class JobStatusResponse(BaseModel):
  id: str
  state: str  # "queued" | "running" | "complete" | "unavailable"
  reason: Optional[str] = None
  result: Optional[Dict[str, Any]] = None


# Ephemeral in-memory job cache
JOBS_STORE: Dict[str, Dict[str, Any]] = {}
DEDUPE_INDEX: Dict[str, str] = {}


def create_app() -> FastAPI:
  app = FastAPI(title="HYSPLIT Smoke Trajectory Service")

  @app.post("/jobs", response_model=JobStatusResponse)
  def create_job(req: JobCreateRequest):
    # Deduplicate key by fireId and observation timestamp
    dedupe_key = f"{req.fireId}_{req.observedAt}"
    if dedupe_key in DEDUPE_INDEX:
      existing_id = DEDUPE_INDEX[dedupe_key]
      existing_job = JOBS_STORE[existing_id]
      return JobStatusResponse(**existing_job)

    job_id = hashlib.sha256(
        f"{req.fireId}_{req.lat}_{req.lon}_{req.observedAt}_{time.time()}".encode()
    ).hexdigest()[:12]

    # Initialize job
    job_record = {
        "id": job_id,
        "state": "running",
        "reason": None,
        "result": None,
    }
    JOBS_STORE[job_id] = job_record
    DEDUPE_INDEX[dedupe_key] = job_id

    # Attempt trajectory run
    traj_req = TrajectoryRequest(
        source_lat=req.lat,
        source_lon=req.lon,
        observed_at=req.observedAt,
        start_heights_m=[100, 500, 1000],
        duration_hours=24,
        weather_file_path="/app/weather/current.arl",
    )

    traj_result: TrajectoryResult = run_trajectories(traj_req)
    if traj_result.status == "complete":
      job_record["state"] = "complete"
      job_record["result"] = traj_result.data
    else:
      job_record["state"] = "unavailable"
      job_record["reason"] = (
          traj_result.reason
          or "Atmospheric weather files are unavailable on this host."
      )

    return JobStatusResponse(**job_record)

  @app.get("/jobs/{job_id}", response_model=JobStatusResponse)
  def get_job_status(job_id: str):
    if job_id not in JOBS_STORE:
      raise HTTPException(
          status_code=404,
          detail="Job not found or expired from disposable memory cache",
      )

    return JobStatusResponse(**JOBS_STORE[job_id])

  return app


app = create_app()
