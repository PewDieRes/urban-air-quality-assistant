import { it, expect } from "vitest";
import { cityClock, scheduleError } from "@/lib/plan/schedule";
import type { Forecast } from "@/lib/forecast/types";

function forecast(zone: string, start: string, hours = 8): Forecast {
  return { lat: 0, lon: 0, timeZone: zone, source: "Open-Meteo", current: null,
    hourly: Array.from({length: hours}, (_, i) => ({at: new Date(Date.parse(start) + i * 3600000).toISOString(), pm25: 40, usAqi: 90})) };
}
it.each([["Asia/Kolkata","09:30"],["Asia/Tokyo","06:00"]])("converts pickup in %s", (zone, utc) => {
  const clock = cityClock(forecast(zone, "2026-11-18T05:00Z"));
  expect(clock.instant("2026-11-18T15:00")).toBe(`2026-11-18T${utc}:00.000Z`);
});
it("rejects nonexistent and ambiguous local times", () => {
  const spring = cityClock(forecast("America/New_York","2026-03-08T05:00Z"));
  const autumn = cityClock(forecast("America/New_York","2026-11-01T04:00Z"));
  expect(() => spring.instant("2026-03-08T02:30")).toThrow();
  expect(() => autumn.instant("2026-11-01T01:30")).toThrow(/twice/);
});
it("rejects reversed windows and windows beyond the last hourly interval", () => {
  const f = forecast("UTC", "2026-11-18T15:00Z", 1);
  const problem = (start: string, end: string) => scheduleError({activities: [], fixedCommitments: [
    {id: "f", title: "Pickup", start: `2026-11-18T${start}Z`, end: `2026-11-18T${end}Z`},
  ]}, f);
  expect(problem("15:30","15:00")).toContain("after");
  expect(problem("15:00","16:01")).toContain("inside");
  expect(problem("15:30","16:00")).toBeNull();
});
