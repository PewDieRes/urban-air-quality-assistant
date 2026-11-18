import os
import pytest
from hysplit import (
    run_trajectories,
    parse_hysplit_tdump,
    TrajectoryRequest,
    TrajectoryResult,
)


def test_trajectory_adapter_requires_weather_and_aligns_times():
    # 1. Missing weather input returns unavailable status
    req_missing_weather = TrajectoryRequest(
        source_lat=30.25,
        source_lon=75.85,
        observed_at="2026-11-18T08:00:00Z",
        start_heights_m=[100, 500, 1000],
        duration_hours=24,
        weather_file_path="/nonexistent/gfs.weather.bin",
    )

    result: TrajectoryResult = run_trajectories(req_missing_weather)
    assert result.status == "unavailable"
    assert "weather" in (result.reason or "").lower()
    assert result.data is None

    # 2. Representative HYSPLIT tdump output produces one ordered timestamp per coordinate
    mock_tdump_content = """     1     1
     1 GFS   24 11 03 06
     3
    24 11 03 08   30.250   75.850    100.0
    24 11 03 08   30.250   75.850    500.0
    24 11 03 08   30.250   75.850   1000.0
     1 PRESSURE
     1     1 24 11 03 08  0.0     0.0   30.250   75.850    100.0  995.0
     1     1 24 11 03 11  0.0     3.0   30.080   76.050    120.0  992.0
     1     1 24 11 03 14  0.0     6.0   29.880   76.280    150.0  988.0
     2     1 24 11 03 08  0.0     0.0   30.250   75.850    500.0  950.0
     2     1 24 11 03 11  0.0     3.0   30.050   76.080    520.0  948.0
     2     1 24 11 03 14  0.0     6.0   29.820   76.320    540.0  945.0
     3     1 24 11 03 08  0.0     0.0   30.250   75.850   1000.0  900.0
     3     1 24 11 03 11  0.0     3.0   30.010   76.120   1010.0  898.0
     3     1 24 11 03 14  0.0     6.0   29.740   76.410   1030.0  895.0
"""

    parsed = parse_hysplit_tdump(mock_tdump_content, "2024-11-03T08:00:00Z")
    assert parsed is not None
    assert len(parsed["features"]) == 3

    for feature in parsed["features"]:
        coords = feature["geometry"]["coordinates"]
        timestamps = feature["properties"]["timestamps"]
        start_height = feature["properties"]["startHeightM"]

        assert start_height in [100, 500, 1000]
        # Assert one ordered timestamp per coordinate
        assert len(coords) == len(timestamps)
        assert len(coords) == 3
        # Timestamps are ordered
        assert timestamps[0] < timestamps[1] < timestamps[2]
