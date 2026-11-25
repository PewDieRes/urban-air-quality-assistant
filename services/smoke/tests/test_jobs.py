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


def test_job_cache_evicts_oldest_entry_when_bounded():
    app = create_app(max_jobs=2)
    client = TestClient(app)

    job_ids = []
    for index in range(3):
        response = client.post(
            "/jobs",
            json={
                "fireId": f"firms-test-{index}",
                "lat": 30.25 + index * 0.1,
                "lon": 75.85,
                "observedAt": f"2026-11-18T0{index + 1}:00:00Z",
            },
        )
        assert response.status_code == 200
        job_ids.append(response.json()["id"])

    # Oldest entry should be evicted once cache capacity (2) is exceeded
    assert client.get(f"/jobs/{job_ids[0]}").status_code == 404
    assert client.get(f"/jobs/{job_ids[1]}").status_code == 200
    assert client.get(f"/jobs/{job_ids[2]}").status_code == 200
    assert client.get("/jobs/bad..id").status_code == 400
