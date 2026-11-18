import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseFirmsCsv, listFires, type FireDetection } from "@/lib/fires/firms";
import { Bounds } from "@/lib/map/regional-cells";

describe("NASA FIRMS fire detections and observation times", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("firmsRowsKeepUtcObservationTimes: parses UTC date and zero-padded 3 or 4-digit observation time into exact UTC ISO string and validates coordinates", () => {
    const mockCsv = `latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,version,bright_ti5,frp,daynight
29.1234,76.5678,335.2,0.4,0.3,2026-11-18,830,N,nominal,2.0N,295.4,14.2,D
30.5432,75.9876,340.1,0.5,0.4,2026-11-18,1425,N,high,2.0N,299.1,22.0,N
invalid_lat,76.0,300,0,0,2026-11-18,0500,N,nominal,2.0N,280,5.0,D`;

    const fires: FireDetection[] = parseFirmsCsv(mockCsv);

    // Invalid row skipped, 2 valid rows parsed
    expect(fires).toHaveLength(2);

    // 1st row: acq_time '830' zero-padded to 08:30 UTC
    expect(fires[0].observedAt).toBe("2026-11-18T08:30:00.000Z");
    expect(fires[0].lat).toBe(29.1234);
    expect(fires[0].lon).toBe(76.5678);
    expect(fires[0].source).toBe("NASA FIRMS");

    // 2nd row: acq_time '1425' -> 14:25 UTC
    expect(fires[1].observedAt).toBe("2026-11-18T14:25:00.000Z");
    expect(fires[1].lat).toBe(30.5432);
    expect(fires[1].lon).toBe(75.9876);
  });

  it("handles upstream FIRMS unavailable state without crashing", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
    });

    const bounds: Bounds = { west: 75, south: 28, east: 78, north: 31 };
    await expect(listFires(bounds, "dummy-map-key")).rejects.toThrow(/FIRMS/);
  });

  it("splits queries when crossing the antimeridian", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "latitude,longitude,acq_date,acq_time\n-35.0,178.0,2026-11-18,1200",
    });
    global.fetch = fetchMock;

    // West: 175, East: -175 (crosses 180 antimeridian)
    const bounds: Bounds = { west: 175, south: -40, east: -175, north: -30 };
    await listFires(bounds, "dummy-map-key");

    // Expect two fetches covering [175, 180] and [-180, -175]
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
