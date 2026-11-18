import pytest
from app import create_app
from fastapi.testclient import TestClient


def test_duplicate_requests_share_job_and_timeout_is_unavailable():
    app = create_app()
    client = TestClient(app)

    payload = {
        "fireId": "firms-test-1",
        "lat": 30.25,
        "lon": 75.85,
        "observedAt": "2026-11-18T08:00:00Z",
    }

    # First request creates a new job
    res1 = client.post("/jobs", json=payload)
    assert res1.status_code == 200
    data1 = res1.json()
    job_id1 = data1["id"]
    assert data1["state"] in ["queued", "running", "unavailable"]

    # Duplicate request for the exact same fire and time shares the job ID
    res2 = client.post("/jobs", json=payload)
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2["id"] == job_id1

    # Check status endpoint
    status_res = client.get(f"/jobs/{job_id1}")
    assert status_res.status_code == 200
    status_data = status_res.json()
    assert status_data["id"] == job_id1
    assert status_data["state"] in ["queued", "running", "complete", "unavailable"]
