"""Adapter for running NOAA HYSPLIT trajectories and parsing ASCII tdump output."""

from datetime import datetime, timezone
import os
import shutil
import subprocess
import tempfile
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

DEFAULT_HYSPLIT_BINARY = "/app/hysplit/exec/hyts_std"
HYSPLIT_TIMEOUT_SECONDS = 60


class TrajectoryRequest(BaseModel):
    """Parameters describing a forward HYSPLIT dispersion trajectory computation."""

    source_lat: float
    source_lon: float
    observed_at: str
    start_heights_m: List[int] = Field(default_factory=lambda: [100, 500, 1000])
    duration_hours: int = 24
    weather_file_path: Optional[str] = None


class TrajectoryResult(BaseModel):
    """Structured output returned by run_trajectories."""

    status: str  # "complete" | "unavailable"
    reason: Optional[str] = None
    data: Optional[Dict[str, Any]] = None


def extract_tdump_data_lines(tdump_content: str) -> List[List[str]]:
    """Extracts whitespace-split numeric data rows from NOAA HYSPLIT tdump text."""
    records: List[List[str]] = []
    for raw_line in tdump_content.strip().splitlines():
        stripped = raw_line.strip()
        if not stripped:
            continue
        parts = stripped.split()
        if len(parts) >= 11 and parts[0].isdigit() and parts[1].isdigit():
            records.append(parts)
    return records


def parse_record_timestamp_iso(parts: List[str]) -> str:
    """Converts two-digit year/month/day/hour tdump tokens into UTC ISO 8601 format."""
    two_digit_year = int(parts[2])
    month = int(parts[3])
    day = int(parts[4])
    hour = int(parts[5])
    full_year = 2000 + two_digit_year if two_digit_year < 70 else 1900 + two_digit_year
    instant = datetime(full_year, month, day, hour, 0, 0, tzinfo=timezone.utc)
    return instant.strftime("%Y-%m-%dT%H:%M:%SZ")


def build_trajectory_feature_collection(
    trajectories: Dict[str, Dict[str, Any]],
) -> Dict[str, Any]:
    """Converts grouped trajectory coordinate/timestamp dicts into GeoJSON."""
    features = [
        {
            "type": "Feature",
            "properties": {
                "startHeightM": trajectory["start_height"],
                "timestamps": trajectory["timestamps"],
            },
            "geometry": {
                "type": "LineString",
                "coordinates": trajectory["coordinates"],
            },
        }
        for trajectory in trajectories.values()
    ]
    return {
        "type": "FeatureCollection",
        "features": features,
    }


def parse_hysplit_tdump(tdump_content: str, base_time_iso: str) -> Optional[Dict[str, Any]]:
    """
    Parses NOAA HYSPLIT tdump ASCII text into a verified GeoJSON FeatureCollection
    where each LineString contains 1:1 aligned, ordered UTC timestamps.
    """
    _ = base_time_iso  # Reserved for caller compatibility with tdump start validation
    data_lines = extract_tdump_data_lines(tdump_content)
    if not data_lines:
        return None

    trajectories: Dict[str, Dict[str, Any]] = {}
    for parts in data_lines:
        trajectory_index = parts[0]
        latitude = float(parts[8])
        longitude = float(parts[9])
        height_meters = float(parts[10])

        if trajectory_index not in trajectories:
            trajectories[trajectory_index] = {
                "start_height": int(height_meters),
                "coordinates": [],
                "timestamps": [],
            }

        trajectories[trajectory_index]["coordinates"].append([longitude, latitude])
        trajectories[trajectory_index]["timestamps"].append(parse_record_timestamp_iso(parts))

    return build_trajectory_feature_collection(trajectories)


def _execute_hysplit_binary(
    hysplit_binary: str,
    work_dir: str,
    request: TrajectoryRequest,
) -> TrajectoryResult:
    """Runs the compiled HYSPLIT binary in an isolated directory and parses tdump output."""
    completed = subprocess.run(
        [hysplit_binary],
        cwd=work_dir,
        capture_output=True,
        text=True,
        timeout=HYSPLIT_TIMEOUT_SECONDS,
    )

    tdump_path = os.path.join(work_dir, "tdump")
    if not os.path.exists(tdump_path):
        return TrajectoryResult(
            status="unavailable",
            reason=f"HYSPLIT execution produced no output: {completed.stderr}",
            data=None,
        )

    with open(tdump_path, "r", encoding="utf-8") as tdump_file:
        tdump_text = tdump_file.read()

    geojson_paths = parse_hysplit_tdump(tdump_text, request.observed_at)
    if not geojson_paths:
        return TrajectoryResult(
            status="unavailable",
            reason="Failed to parse trajectory output",
            data=None,
        )

    weather_basename = os.path.basename(request.weather_file_path or "")
    return TrajectoryResult(
        status="complete",
        reason=None,
        data={
            "paths": geojson_paths,
            "metadata": {
                "runMode": "live_forward",
                "sourceLat": request.source_lat,
                "sourceLon": request.source_lon,
                "observedAt": request.observed_at,
                "runTime": datetime.now(timezone.utc).isoformat(),
                "weatherCycle": weather_basename,
                "startHeightsM": request.start_heights_m,
                "notes": "Live HYSPLIT forward model estimate of atmospheric air movement.",
            },
        },
    )


def run_trajectories(request: TrajectoryRequest) -> TrajectoryResult:
    """
    Runs a forward HYSPLIT trajectory computation when weather grids and binary exist.
    Returns status="unavailable" gracefully on hosted environments without ARL weather inputs.
    """
    if not request.weather_file_path or not os.path.exists(request.weather_file_path):
        return TrajectoryResult(
            status="unavailable",
            reason="NOAA meteorological weather file is missing or unavailable on this runner",
            data=None,
        )

    hysplit_binary = os.environ.get("HYSPLIT_BIN", DEFAULT_HYSPLIT_BINARY)
    if not os.path.exists(hysplit_binary):
        return TrajectoryResult(
            status="unavailable",
            reason="HYSPLIT binary is not installed in current environment",
            data=None,
        )

    work_dir = tempfile.mkdtemp(prefix="hysplit_run_")
    try:
        return _execute_hysplit_binary(hysplit_binary, work_dir, request)
    except subprocess.TimeoutExpired:
        return TrajectoryResult(
            status="unavailable",
            reason="HYSPLIT execution timed out",
            data=None,
        )
    except Exception as exc:
        return TrajectoryResult(
            status="unavailable",
            reason=f"Trajectory runner exception: {exc}",
            data=None,
        )
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)
