import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  searchLocations,
  formatPlaceLabel,
  detectLocationFromIp,
  reverseGeocode,
  type Place,
} from "@/lib/location/search";

describe("location search and disambiguation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("cityResultsAreDisambiguated: given results with the same name, each includes region and country and has a stable ID", async () => {
    // Mock fetch for Open-Meteo geocoding API returning two cities with the same name
    const mockGeocodingResponse = {
      results: [
        {
          id: 4887398,
          name: "Chicago",
          latitude: 41.85003,
          longitude: -87.65005,
          admin1: "Illinois",
          country: "United States",
          timezone: "America/Chicago",
        },
        {
          id: 4887410,
          name: "Chicago",
          latitude: 41.8781,
          longitude: -87.6298,
          admin1: "Indiana",
          country: "United States",
          timezone: "America/Indiana/Knox",
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockGeocodingResponse,
    });

    const places: Place[] = await searchLocations("Chicago");

    expect(places).toHaveLength(2);
    // Distinct stable IDs
    expect(places[0].id).toBe("4887398");
    expect(places[1].id).toBe("4887410");
    expect(places[0].id).not.toBe(places[1].id);

    // Display labels include region and country for disambiguation
    const label0 = formatPlaceLabel(places[0]);
    const label1 = formatPlaceLabel(places[1]);

    expect(label0).toContain("Illinois");
    expect(label0).toContain("United States");
    expect(label1).toContain("Indiana");
    expect(label1).toContain("United States");
    expect(label0).not.toBe(label1);
  });

  it("returns empty array for empty or short queries", async () => {
    const places = await searchLocations("  ");
    expect(places).toEqual([]);
  });

  it("handles upstream failure by throwing or returning graceful empty array without crashing", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));
    await expect(searchLocations("Delhi")).rejects.toThrow();
  });

  it("detectLocationFromIp resolves location from IP provider response", async () => {
    const mockIpResponse = {
      success: true,
      city: "Pune",
      region: "Maharashtra",
      country: "India",
      latitude: 18.52,
      longitude: 73.85,
      timezone: { id: "Asia/Kolkata" },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockIpResponse,
    });

    const place = await detectLocationFromIp("127.0.0.1");
    expect(place).not.toBeNull();
    expect(place?.name).toBe("Pune");
    expect(place?.region).toBe("Maharashtra");
    expect(place?.country).toBe("India");
    expect(place?.lat).toBe(18.52);
    expect(place?.lon).toBe(73.85);
  });

  it("reverseGeocode returns human-readable city from coordinates", async () => {
    const mockNominatimResponse = {
      address: {
        city: "Pune",
        state: "Maharashtra",
        country: "India",
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockNominatimResponse,
    });

    const place = await reverseGeocode(18.52, 73.85);
    expect(place.name).toBe("Pune");
    expect(place.region).toBe("Maharashtra");
    expect(place.country).toBe("India");
  });
});
