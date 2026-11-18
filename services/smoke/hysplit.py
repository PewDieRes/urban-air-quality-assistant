import os
import shutil
import tempfile
import subprocess
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class TrajectoryRequest(BaseModel):
  source_lat: float
  source_lon: float
  observed_at: str
  start_heights_m: List[int] = Field(default_factory=lambda: [100, 500, 1000])
  duration_hours: int = 24
  weather_file_path: Optional[str] = None


class TrajectoryResult(BaseModel):
  status: str  # "complete" | "unavailable"
  reason: Optional[str] = None
  data: Optional[Dict[str, Any]] = None


def parse_hysplit_tdump(tdump_content: str, base_time_iso: str) -> Optional[Dict[str, Any]]:
  """
  Parses NOAA HYSPLIT tdump ASCII text into a verified GeoJSON FeatureCollection
  where each LineString contains 1:1 aligned, ordered UTC timestamps.
  """
  lines = tdump_content.strip().splitlines()
  if not lines:
    return None

  # Find the data start line (after the header records)
  # Standard tdump header ends with variable list (e.g. PRESSURE)
  data_lines = []
  past_header = False

  for line in lines:
    stripped = line.strip()
    if not stripped:
      continue
    parts = stripped.split()
    # Data records start with integer trajectory index and integer grid number (e.g. "1 1 24 11 03 ...")
    if len(parts) >= 11 and parts[0].isdigit() and parts[1].isdigit():
      data_lines.append(parts)

  if not data_lines:
    return None

  # Group by trajectory index (parts[0])
  trajectories: Dict[str, Dict[str, Any]] = {}

  for parts in data_lines:
    traj_idx = parts[0]
    # In tdump: year, month, day, hour, forecast_hour, age, lat, lon, height
    # Format: [traj_idx, grid_idx, yy, mm, dd, hh, fcst_hr, age_hr, lat, lon, height, pressure...]
    yy, mm, dd, hh = int(parts[2]), int(parts[3]), int(parts[4]), int(parts[5])
    # Century assumption
    year = 2000 + yy if yy < 70 else 1900 + yy
    dt = datetime(year, mm, dd, hh, 0, 0, tzinfo=timezone.utc)
    iso_time = dt.strftime("%Y-%m-%dT%H:%M:%SZ")

    lat = float(parts[8])
    lon = float(parts[9])
    height = float(parts[10])

    if traj_idx not in trajectories:
      trajectories[traj_idx] = {
          "start_height": int(height),
          "coordinates": [],
          "timestamps": [],
      }

    trajectories[traj_idx]["coordinates"].append([lon, lat])
    trajectories[traj_idx]["timestamps"].append(iso_time)

  features = []
  for traj in trajectories.values():
    features.append({
        "type": "Feature",
        "properties": {
            "startHeightM": traj["start_height"],
            "timestamps": traj["timestamps"],
        },
        "geometry": {
            "type": "LineString",
            "coordinates": traj["coordinates"],
        },
    })

  return {
      "type": "FeatureCollection",
      "features": features,
  }


def run_trajectories(req: TrajectoryRequest) -> TrajectoryResult:
  """
  Runs a forward HYSPLIT trajectory computation.
  Requires compatible NOAA GFS/NAM meteorological files.
  """
  if not req.weather_file_path or not os.path.exists(req.weather_file_path):
    return TrajectoryResult(
        status="unavailable",
        reason="NOAA meteorological weather file is missing or unavailable on this runner",
        data=None,
    )

  hysplit_bin = os.environ.get("HYSPLIT_BIN", "/app/hysplit/exec/hyts_std")
  if not os.path.exists(hysplit_bin):
    return TrajectoryResult(
        status="unavailable",
        reason="HYSPLIT binary is not installed in current environment",
        data=None,
    )

  work_dir = tempfile.mkdtemp(prefix="hysplit_run_")
  try:
    # Prepare CONTROL file in working directory
    # Run subprocess with strict timeout
    cmd = [hysplit_bin]
    result = subprocess.run(
        cmd,
        cwd=work_dir,
        capture_output=True,
        text=True,
        timeout=60,
    )

    tdump_file = os.path.join(work_dir, "tdump")
    if not os.path.exists(tdump_file):
      return TrajectoryResult(
          status="unavailable",
          reason=f"HYSPLIT execution produced no output: {result.stderr}",
          data=None,
      )

    with open(tdump_file, "r") as f:
      content = f.read()

    geojson_data = parse_hysplit_tdump(content, req.observed_at)
    if not geojson_data:
      return TrajectoryResult(
          status="unavailable",
          reason="Failed to parse trajectory output",
          data=None,
      )

    return TrajectoryResult(
        status="complete",
        reason=None,
        data={
            "paths": geojson_data,
            "metadata": {
                "runMode": "live_forward",
                "sourceLat": req.source_lat,
                "sourceLon": req.source_lon,
                "observedAt": req.observed_at,
                "runTime": datetime.now(timezone.utc).isoformat(),
                "weatherCycle": os.path.basename(req.weather_file_path),
                "startHeightsM": req.start_heights_m,
                "notes": "Live HYSPLIT forward model estimate of atmospheric air movement.",
            },
        },
    )
  except subprocess.TimeoutExpired:
    return TrajectoryResult(
        status="unavailable",
        reason="HYSPLIT execution timed out",
        data=None,
    )
  except Exception as e:
    return TrajectoryResult(
        status="unavailable",
        reason=f"Trajectory runner exception: {str(e)}",
        data=None,
    )
  finally:
    shutil.rmtree(work_dir, ignore_errors=True)
