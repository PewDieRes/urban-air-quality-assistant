import type { Forecast } from "../forecast/types";
import type { PlanInput } from "./types";
import { formatHourlyTimeWithDate } from "../forecast/open-meteo";

export function forecastRange(forecast: Forecast) {
  const hours = forecast.hourly;
  if (!hours.length) return null;
  return { start: Date.parse(hours[0].at), end: Date.parse(hours[hours.length - 1].at) + 3600000 };
}

export function scheduleError(input: Pick<PlanInput, "activities" | "fixedCommitments">, forecast: Forecast) {
  const range = forecastRange(forecast);
  if (!range) return "The forecast has no hours available.";
  const windows = [...input.activities.map(a => [a.title, a.windowStart, a.windowEnd]),
    ...(input.fixedCommitments || []).map(f => [f.title, f.start, f.end])];
  for (const [title, start, end] of windows) {
    const a = Date.parse(start), b = Date.parse(end);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return `${title}: choose an end after the start.`;
    if (a < range.start || b > range.end) {
      const startStr = formatHourlyTimeWithDate(new Date(range.start).toISOString(), forecast.timeZone).full;
      const endStr = formatHourlyTimeWithDate(new Date(range.end).toISOString(), forecast.timeZone).full;
      return `${title}: choose times inside the displayed forecast (${startStr} to ${endStr}).`;
    }
  }
  return null;
}

// Index the forecast's actual minutes. This also detects skipped or repeated local times at DST changes.
export function cityClock(forecast: Forecast) {
  const format = new Intl.DateTimeFormat("sv-SE", {timeZone: forecast.timeZone, year: "numeric",
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"});
  const local = (at: number | string) => format.format(new Date(at)).replace(" ", "T");
  const range = forecastRange(forecast);
  const instants = new Map<string, number | null>();
  if (range) {
    for (let at = range.start; at <= range.end; at += 60000) {
      const value = local(at);
      instants.set(value, instants.has(value) ? null : at);
    }
  }
  function instant(value: string) {
    const at = instants.get(value);
    if (at === null) throw new Error(`${value} occurs twice in ${forecast.timeZone}. Choose an unambiguous time.`);
    if (at === undefined) throw new Error(`Choose a local date and time within the forecast for ${forecast.timeZone}.`);
    return new Date(at).toISOString();
  }
  return { local, instant, range };
}
