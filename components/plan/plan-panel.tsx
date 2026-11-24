"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  PlanInput,
  PlanFacts,
  PlanNarrative,
  FlexibleActivity,
  FixedCommitment,
  TransportMode,
} from "@/lib/plan/types";
import { Forecast } from "@/lib/forecast/types";
import { computePlanFacts } from "@/lib/plan/facts";
import { cityClock, scheduleError, forecastRange } from "@/lib/plan/schedule";
import { formatHourlyTime } from "@/lib/forecast/open-meteo";
import {
  Calendar,
  Clock,
  Car,
  Home,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  Leaf,
  Shield,
  Loader2,
  RefreshCw,
  Sparkles,
  ChevronDown,
} from "lucide-react";

interface PlanPanelProps {
  forecast: Forecast | null;
  locationName: string;
  lat: number;
  lon: number;
}

const STORAGE_KEY = "urban_aq_plan_prefs";

export function PlanPanel({ forecast, locationName, lat, lon }: PlanPanelProps) {
  const clock = useMemo(() => (forecast ? cityClock(forecast) : null), [forecast]);
  const range = useMemo(() => (forecast ? forecastRange(forecast) : null), [forecast]);
  const initialized = useRef(false);
  const [inputError, setInputError] = useState<string | null>(null);

  // Activity state
  const [activities, setActivities] = useState<FlexibleActivity[]>([
    {
      id: "act-1",
      title: "Grocery shopping",
      windowStart: "",
      windowEnd: "",
      durationMinutes: 60,
    },
  ]);

  // Fixed commitments state
  const [fixedCommitments, setFixedCommitments] = useState<FixedCommitment[]>([
    {
      id: "fix-1",
      title: "School pickup",
      start: "",
      end: "",
    },
  ]);

  // Transport details
  const [transportMode, setTransportMode] = useState<TransportMode>("car");
  const [distanceKm, setDistanceKm] = useState<string>("8");
  const [availableModes, setAvailableModes] = useState<TransportMode[]>([
    "car",
    "transit",
    "walk",
    "bike",
    "ev",
  ]);

  // Household & Budget
  const [sensitiveMembers, setSensitiveMembers] = useState<boolean>(true);
  const [hasAirPurifier, setHasAirPurifier] = useState<boolean>(true);
  const [budgetLevel, setBudgetLevel] = useState<"low" | "medium" | "high">("medium");

  // Plan generation state
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [planStatus, setPlanStatus] = useState<"gemini_generated" | "deterministic_fallback" | null>(null);
  const [modelUsed, setModelUsed] = useState<string | null>(null);
  const [factsResult, setFactsResult] = useState<PlanFacts | null>(null);
  const [narrativeResult, setNarrativeResult] = useState<PlanNarrative | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // Clear previous generated results when location coordinates change
  useEffect(() => {
    setFactsResult(null);
    setNarrativeResult(null);
    setPlanStatus(null);
    setModelUsed(null);
    setGenerationError(null);
  }, [lat, lon, locationName]);

  // Initialize default window dates when forecast loads
  useEffect(() => {
    if (clock?.range && forecast && !initialized.current) {
      initialized.current = true;
      const firstHour = clock.local(clock.range.start);
      const end = (hours: number) =>
        clock.local(Math.min(clock.range!.end, clock.range!.start + hours * 3600000));
      const secondHour = clock.local(
        Math.min(clock.range.end - 3600000, clock.range.start + 2 * 3600000)
      );
      const thirdHour = end(3);
      const sixthHour = end(6);

      setActivities((prev) =>
        prev.map((a) => ({
          ...a,
          windowStart: a.windowStart || firstHour,
          windowEnd: a.windowEnd || sixthHour,
        }))
      );

      setFixedCommitments((prev) =>
        prev.map((f) => ({
          ...f,
          start: f.start || secondHour,
          end: f.end || thirdHour,
        }))
      );
    }
  }, [clock, forecast]);

  // Load preferences from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.transportMode) setTransportMode(parsed.transportMode);
        if (parsed.distanceKm) setDistanceKm(parsed.distanceKm);
        if (parsed.availableModes) setAvailableModes(parsed.availableModes);
        if (parsed.sensitiveMembers !== undefined) setSensitiveMembers(parsed.sensitiveMembers);
        if (parsed.hasAirPurifier !== undefined) setHasAirPurifier(parsed.hasAirPurifier);
        if (parsed.budgetLevel) setBudgetLevel(parsed.budgetLevel);
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  const savePreferences = () => {
    try {
      const prefs = {
        transportMode,
        distanceKm,
        availableModes,
        sensitiveMembers,
        hasAirPurifier,
        budgetLevel,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // Ignore storage errors
    }
  };

  const handleToggleMode = (mode: TransportMode) => {
    if (availableModes.includes(mode)) {
      setAvailableModes(availableModes.filter((m) => m !== mode));
    } else {
      setAvailableModes([...availableModes, mode]);
    }
  };

  const handleAddActivity = () => {
    if (!forecast || !clock?.range) return;
    const newAct: FlexibleActivity = {
      id: `act-${Date.now()}`,
      title: "Outdoor walk / errand",
      windowStart: clock.local(clock.range.start),
      windowEnd: clock.local(Math.min(clock.range.end, clock.range.start + 6 * 3600000)),
      durationMinutes: 60,
    };
    setActivities([...activities, newAct]);
  };

  const handleRemoveActivity = (id: string) => {
    if (activities.length > 1) {
      setActivities(activities.filter((a) => a.id !== id));
    }
  };

  const handleAddCommitment = () => {
    if (!forecast || !clock?.range) return;
    const newComm: FixedCommitment = {
      id: `fix-${Date.now()}`,
      title: "Work appointment",
      start: clock.local(clock.range.start),
      end: clock.local(Math.min(clock.range.end, clock.range.start + 3600000)),
    };
    setFixedCommitments([...fixedCommitments, newComm]);
  };

  const handleRemoveCommitment = (id: string) => {
    setFixedCommitments(fixedCommitments.filter((f) => f.id !== id));
  };

  const handleBuildPlan = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!forecast || !clock) return;

    let schedule: Pick<PlanInput, "activities" | "fixedCommitments">;
    try {
      schedule = {
        activities: activities.map((a) => ({
          ...a,
          windowStart: clock.instant(a.windowStart),
          windowEnd: clock.instant(a.windowEnd),
        })),
        fixedCommitments: fixedCommitments.map((f) => ({
          ...f,
          start: clock.instant(f.start),
          end: clock.instant(f.end),
        })),
      };
      const problem = scheduleError(schedule, forecast);
      if (problem) throw new Error(problem);
    } catch (error) {
      setInputError(error instanceof Error ? error.message : "Check your schedule.");
      return;
    }

    setInputError(null);
    savePreferences();
    setIsGenerating(true);
    setGenerationError(null);

    const distNum = parseFloat(distanceKm);
    const planInput: PlanInput = {
      ...schedule,
      transport: {
        mode: transportMode,
        distanceKm: !isNaN(distNum) && distNum > 0 ? distNum : undefined,
      },
      availableTransportModes: availableModes,
      household: {
        sensitiveMembers,
        hasAirPurifier,
      },
      budget: budgetLevel,
    };

    // Immediate verified calculations
    const calculatedFacts = computePlanFacts(planInput, forecast);
    setFactsResult(calculatedFacts);

    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat,
          lon,
          input: planInput,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `Generation returned status ${res.status}`);
      }

      const data = await res.json();
      setPlanStatus(data.status || "deterministic_fallback");
      setModelUsed(data.modelUsed || null);

      if (data.facts) {
        setFactsResult(data.facts);
      }
      if (data.narrative) {
        setNarrativeResult(data.narrative);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Plan generation unavailable";
      setGenerationError(msg);
      setPlanStatus("deterministic_fallback");
      setModelUsed(null);
    } finally {
      setIsGenerating(false);
    }
  };

  const timeZone = forecast?.timeZone || "UTC";

  // Available range label for inputs outside forecast
  const availableRangeText = range
    ? `${formatHourlyTime(new Date(range.start).toISOString(), timeZone)} to ${formatHourlyTime(new Date(range.end).toISOString(), timeZone)}`
    : "";

  // Derive decision headline & explanation from verified facts
  const decisionOutput = useMemo(() => {
    if (!factsResult) return null;
    const primaryAct = factsResult.activities[0];
    const firstCommitment = factsResult.fixedCommitments[0];

    if (!primaryAct) {
      return {
        headline: "No activities scheduled",
        explanation: "Add a flexible activity to find the lowest-pollution hour.",
      };
    }

    if (!primaryAct.bestCandidate) {
      return {
        headline: `No eligible slot for ${primaryAct.title}`,
        explanation: firstCommitment
          ? `${firstCommitment.title} stays at ${formatHourlyTime(firstCommitment.start, timeZone)}. No available hour in your requested window fits your activity around it. Try widening your time window.`
          : `No available hour in your requested window fits your activity duration. Try widening your time window.`,
      };
    }

    const bestTime = formatHourlyTime(primaryAct.bestCandidate.at, timeZone);
    const bestPm = primaryAct.bestCandidate.pm25 !== null ? Math.round(primaryAct.bestCandidate.pm25) : null;
    const pickupStay = firstCommitment
      ? `${firstCommitment.title} stays at ${formatHourlyTime(firstCommitment.start, timeZone)}. `
      : "";

    // Earliest eligible hour was already best
    if (primaryAct.isEarliestAlreadyBest) {
      return {
        headline: `Keep your original time: ${bestTime}`,
        explanation: `${pickupStay}For your ${primaryAct.title.toLowerCase()}, the earliest slot at ${bestTime} already offers the lowest forecast pollution (${bestPm} µg/m³).`,
      };
    }

    // Two hours tied
    if (primaryAct.tiedCandidates && primaryAct.tiedCandidates.length > 0) {
      const tiedTime = formatHourlyTime(primaryAct.tiedCandidates[0].at, timeZone);
      return {
        headline: `${primaryAct.title} at ${bestTime}`,
        explanation: `${pickupStay}Both ${bestTime} and ${tiedTime} have the same lowest forecast PM₂.₅ (${bestPm} µg/m³).`,
      };
    }

    // Rescheduled to lower-pollution hour
    if (factsResult.beforeAfterComparison) {
      const baselineTime = formatHourlyTime(factsResult.beforeAfterComparison.baselineTime, timeZone);
      const baselinePm = factsResult.beforeAfterComparison.baselinePm25 !== null
        ? Math.round(factsResult.beforeAfterComparison.baselinePm25)
        : null;
      const reduction = factsResult.beforeAfterComparison.exposureReductionPercent;
      return {
        headline: `${primaryAct.title} at ${bestTime}`,
        explanation: `${pickupStay}For your ${primaryAct.durationMinutes ? primaryAct.durationMinutes + "-minute" : ""} ${primaryAct.title.toLowerCase()}, the forecast is ${bestPm} µg/m³ at ${bestTime}, compared with ${baselinePm} µg/m³ at ${baselineTime} (${reduction}% lower forecast PM₂.₅).`,
      };
    }

    return {
      headline: `${primaryAct.title} at ${bestTime}`,
      explanation: `${pickupStay}Forecast PM₂.₅ is ${bestPm} µg/m³ at ${bestTime}, fitting within your schedule.`,
    };
  }, [factsResult, timeZone]);

  return (
    <section
      aria-labelledby="plan-my-day-heading"
      className="bg-white border border-stone-200/90 rounded-2xl p-5 shadow-sm text-stone-900"
    >
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3.5 border-b border-stone-100">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200/60">
              Planner
            </span>
            <span className="text-xs text-stone-500 font-mono">
              Schedule in {timeZone}
            </span>
          </div>
          <h2 id="plan-my-day-heading" className="text-xl font-bold text-stone-900 mt-1">
            Plan my day · {locationName}
          </h2>
          <span className="sr-only">Build My Smog Plan · {locationName}</span>
          <p className="text-xs text-stone-500 mt-0.5">
            Keep fixed commitments in place, and find the lowest-pollution hour for errands.
          </p>
        </div>
      </div>

      {inputError && (
        <div role="alert" className="mt-3 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
          {inputError}
          {availableRangeText && (
            <span className="block mt-1 text-stone-500">Available forecast range: {availableRangeText}</span>
          )}
        </div>
      )}

      {/* Schedule Form */}
      <form onSubmit={handleBuildPlan} className="mt-4 space-y-4">
        {/* Fixed Commitments Row (School pickup) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-stone-700 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-stone-500" />
              Fixed Commitment (Stays fixed)
            </span>
            <button
              type="button"
              onClick={handleAddCommitment}
              className="text-[11px] font-medium text-teal-700 hover:text-teal-900 transition flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              Add commitment
            </button>
          </div>

          <div className="space-y-2">
            {fixedCommitments.map((commitment) => (
              <div
                key={commitment.id}
                className="bg-stone-50 border border-stone-200/80 rounded-xl p-3 flex flex-wrap items-center gap-3"
              >
                <div className="w-44 min-w-[140px]">
                  <label htmlFor={`comm-title-${commitment.id}`} className="sr-only">
                    Fixed Commitment Title
                  </label>
                  <input
                    id={`comm-title-${commitment.id}`}
                    type="text"
                    value={commitment.title}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFixedCommitments(
                        fixedCommitments.map((c) => (c.id === commitment.id ? { ...c, title: val } : c))
                      );
                    }}
                    className="w-full bg-white border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-teal-700"
                    placeholder="e.g. School pickup"
                  />
                </div>

                <div className="flex-1 min-w-[240px]">
                  <TimeWindow
                    label="Commitment"
                    start={commitment.start}
                    end={commitment.end}
                    zone={timeZone}
                    onChange={(start, end) =>
                      setFixedCommitments((rows) =>
                        rows.map((f) => (f.id === commitment.id ? { ...f, start, end } : f))
                      )
                    }
                  />
                </div>

                {fixedCommitments.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveCommitment(commitment.id)}
                    aria-label={`Remove commitment ${commitment.title}`}
                    className="p-1 text-stone-400 hover:text-rose-600 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Flexible Activities Row (Grocery trip) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-stone-700 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-teal-700" />
              Flexible Activity (Can move to lower pollution)
            </span>
            <button
              type="button"
              onClick={handleAddActivity}
              className="text-[11px] font-medium text-teal-700 hover:text-teal-900 transition flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              Add activity
            </button>
          </div>

          <div className="space-y-2">
            {activities.map((activity) => (
              <div
                key={activity.id}
                className="bg-stone-50 border border-stone-200/80 rounded-xl p-3 flex flex-wrap items-center gap-3"
              >
                <div className="w-40 min-w-[130px]">
                  <label htmlFor={`act-title-${activity.id}`} className="sr-only">
                    Activity Title
                  </label>
                  <input
                    id={`act-title-${activity.id}`}
                    type="text"
                    value={activity.title}
                    onChange={(e) => {
                      const val = e.target.value;
                      setActivities(
                        activities.map((a) => (a.id === activity.id ? { ...a, title: val } : a))
                      );
                    }}
                    className="w-full bg-white border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-teal-700"
                    placeholder="e.g. Grocery shopping"
                    required
                  />
                </div>

                <div className="w-28">
                  <label htmlFor={`act-dur-${activity.id}`} className="sr-only">
                    Duration
                  </label>
                  <select
                    id={`act-dur-${activity.id}`}
                    value={activity.durationMinutes}
                    onChange={(e) => {
                      const dur = parseInt(e.target.value, 10);
                      setActivities(
                        activities.map((a) => (a.id === activity.id ? { ...a, durationMinutes: dur } : a))
                      );
                    }}
                    className="w-full bg-white border border-stone-200 rounded-lg px-2 py-1.5 text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-teal-700"
                  >
                    <option value={30}>30 min</option>
                    <option value={60}>1 hour</option>
                    <option value={90}>1.5 hours</option>
                    <option value={120}>2 hours</option>
                  </select>
                </div>

                <div className="flex-1 min-w-[240px]">
                  <TimeWindow
                    label="Activity"
                    start={activity.windowStart}
                    end={activity.windowEnd}
                    zone={timeZone}
                    onChange={(start, end) =>
                      setActivities((rows) =>
                        rows.map((a) => (a.id === activity.id ? { ...a, windowStart: start, windowEnd: end } : a))
                      )
                    }
                  />
                </div>

                {activities.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveActivity(activity.id)}
                    aria-label={`Remove activity ${activity.title}`}
                    className="p-1 text-stone-400 hover:text-rose-600 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Optional Settings Disclosure */}
        <details className="border border-stone-200 rounded-xl p-3 bg-white text-xs group">
          <summary className="cursor-pointer font-medium text-stone-700 flex items-center justify-between select-none">
            <span className="flex items-center gap-1.5">
              <Home className="w-3.5 h-3.5 text-stone-500" />
              Optional household, budget &amp; transport settings
            </span>
            <span className="text-stone-400 text-[11px] group-open:rotate-180 transition-transform">
              ▼
            </span>
          </summary>

          <div className="pt-3 mt-3 border-t border-stone-100 space-y-3">
            {/* Transport details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="primary-transport-mode" className="block text-stone-600 mb-1 font-medium">
                  Primary Travel Mode
                </label>
                <select
                  id="primary-transport-mode"
                  value={transportMode}
                  onChange={(e) => setTransportMode(e.target.value as TransportMode)}
                  className="w-full bg-white border border-stone-200 rounded-lg px-2 py-1.5 text-xs text-stone-900"
                >
                  <option value="car">Gasoline / Diesel Car</option>
                  <option value="transit">Public Transit / Metro</option>
                  <option value="ev">Electric Vehicle (EV)</option>
                  <option value="walk">Walking</option>
                  <option value="bike">Bicycle</option>
                  <option value="none">No Travel Needed</option>
                </select>
              </div>

              <div>
                <label htmlFor="trip-distance-km" className="block text-stone-600 mb-1 font-medium">
                  Trip Distance (km, for emissions estimate)
                </label>
                <input
                  id="trip-distance-km"
                  type="number"
                  min="0"
                  max="150"
                  step="0.5"
                  value={distanceKm}
                  onChange={(e) => setDistanceKm(e.target.value)}
                  placeholder="e.g. 8"
                  className="w-full bg-white border border-stone-200 rounded-lg px-2 py-1.5 text-xs text-stone-900"
                />
              </div>
            </div>

            {/* Alternatives checkboxes */}
            <div>
              <span className="block text-stone-600 mb-1.5 font-medium">
                Available transport alternatives
              </span>
              <div className="flex flex-wrap gap-2 text-xs">
                {(["transit", "walk", "bike", "ev"] as TransportMode[]).map((mode) => (
                  <label
                    key={mode}
                    className="flex items-center gap-1.5 px-2 py-1 rounded bg-stone-50 border border-stone-200 cursor-pointer text-stone-700"
                  >
                    <input
                      type="checkbox"
                      checked={availableModes.includes(mode)}
                      onChange={() => handleToggleMode(mode)}
                      className="rounded border-stone-300 text-teal-700 w-3.5 h-3.5"
                    />
                    <span className="capitalize">{mode === "transit" ? "Public Transit" : mode}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Household specifics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-stone-100">
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-xs text-stone-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sensitiveMembers}
                    onChange={(e) => setSensitiveMembers(e.target.checked)}
                    className="rounded border-stone-300 text-teal-700 w-3.5 h-3.5"
                  />
                  <span>Sensitive members (children, asthmatics)</span>
                </label>

                <label className="flex items-center gap-2 text-xs text-stone-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasAirPurifier}
                    onChange={(e) => setHasAirPurifier(e.target.checked)}
                    className="rounded border-stone-300 text-teal-700 w-3.5 h-3.5"
                  />
                  <span>Equipped with particle filter (HEPA)</span>
                </label>
              </div>

              <div>
                <label htmlFor="budget-level-select" className="block text-stone-600 mb-1 font-medium">
                  Indoor Protection Budget
                </label>
                <select
                  id="budget-level-select"
                  value={budgetLevel}
                  onChange={(e) => setBudgetLevel(e.target.value as "low" | "medium" | "high")}
                  className="w-full bg-white border border-stone-200 rounded-lg px-2 py-1.5 text-xs text-stone-900"
                >
                  <option value="low">Low budget (Damp cleaning, draught sealing)</option>
                  <option value="medium">Medium budget (Portable filter)</option>
                  <option value="high">High budget (Multi-room HEPA)</option>
                </select>
              </div>
            </div>
          </div>
        </details>

        {/* Primary Action Button */}
        <div>
          <button
            type="submit"
            disabled={isGenerating}
            aria-label="Build My Smog Plan"
            className="w-full py-2.5 px-4 bg-teal-800 hover:bg-teal-900 text-white font-medium rounded-xl text-sm shadow-sm flex items-center justify-center gap-2 transition disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Finding lowest-pollution hour...</span>
              </>
            ) : (
              <span>Find a time</span>
            )}
          </button>
        </div>
      </form>

      {/* Generated Output Worth Reading (Section 2) */}
      {factsResult && decisionOutput && (
        <div className="mt-6 pt-5 border-t border-stone-200 space-y-4">
          {/* Status Label & Retry */}
          <div className="flex items-center justify-between text-xs">
            <span
              className={`px-2 py-0.5 rounded font-medium ${
                planStatus === "gemini_generated"
                  ? "bg-teal-50 text-teal-800 border border-teal-200"
                  : "bg-stone-100 text-stone-700 border border-stone-200"
              }`}
            >
              {planStatus === "gemini_generated" ? "Explained by Gemini" : "Forecast-based plan"}
            </span>

            {planStatus === "deterministic_fallback" && (
              <button
                type="button"
                onClick={() => handleBuildPlan()}
                disabled={isGenerating}
                className="flex items-center gap-1 text-[11px] text-teal-800 hover:text-teal-900 font-medium"
              >
                <RefreshCw className={`w-3 h-3 ${isGenerating ? "animate-spin" : ""}`} />
                <span>Retry with Gemini</span>
              </button>
            )}
          </div>

          {/* 1. One Headline Giving the Actual Decision */}
          <div className="bg-teal-50/60 border border-teal-200/80 rounded-xl p-4">
            <h3 className="text-lg font-bold text-teal-950 tracking-tight">
              {decisionOutput.headline}
            </h3>
            {/* 2. One Sentence Explaining Why That Hour Fits */}
            <p className="text-xs text-stone-700 mt-1 leading-relaxed">
              {decisionOutput.explanation}
            </p>
          </div>

          {/* 3. Short Timeline: What stays fixed and what can move */}
          <div className="bg-stone-50 border border-stone-200/80 rounded-xl p-3.5 space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500 block">
              Day Schedule Timeline
            </span>

            <div className="space-y-2 text-xs">
              {/* Fixed commitments */}
              {factsResult.fixedCommitments.map((fix) => (
                <div
                  key={fix.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-white border border-stone-200"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-stone-400" />
                    <span className="font-semibold text-stone-800">{fix.title}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-stone-700">
                      {formatHourlyTime(fix.start, timeZone)} - {formatHourlyTime(fix.end, timeZone)}
                    </span>
                    <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-stone-100 text-stone-600">
                      Stays fixed
                    </span>
                  </div>
                </div>
              ))}

              {/* Flexible activities */}
              {factsResult.activities.map((act) => {
                const best = act.bestCandidate;
                const formattedTime = best
                  ? formatHourlyTime(best.at, timeZone)
                  : "No eligible slot";
                const pmStr = best && best.pm25 !== null ? `${Math.round(best.pm25)} µg/m³` : "";

                return (
                  <div
                    key={act.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-teal-50/50 border border-teal-200"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-teal-600" />
                      <span className="font-semibold text-teal-950">{act.title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-teal-900 font-mono">
                        {formattedTime}
                      </span>
                      {pmStr && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-teal-100 text-teal-800">
                          {pmStr}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4. One Practical Indoor Action & One Realistic Transport Alternative */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {/* Practical indoor action */}
            {factsResult.indoorRecommendations.length > 0 && (
              <div className="p-3 rounded-xl bg-white border border-stone-200 space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-stone-600" />
                  Indoor Action
                </span>
                <p className="text-stone-700 leading-snug">
                  {factsResult.indoorRecommendations[0]}
                </p>
              </div>
            )}

            {/* Realistic transport alternative */}
            {factsResult.transportComparison ? (
              <div className="p-3 rounded-xl bg-white border border-stone-200 space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
                  <Leaf className="w-3.5 h-3.5 text-teal-700" />
                  Transport Alternative
                </span>
                <p className="text-stone-700 leading-snug">
                  {factsResult.transportComparison.explanation}
                </p>
                {factsResult.transportComparison.estimatedCo2KgSaved !== null &&
                  factsResult.transportComparison.estimatedCo2KgSaved > 0 && (
                    <span className="block text-[11px] font-medium text-teal-800">
                      Estimated savings: {factsResult.transportComparison.estimatedCo2KgSaved}{" "}
                      {factsResult.transportComparison.units}
                    </span>
                  )}
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-white border border-stone-200 space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
                  <Leaf className="w-3.5 h-3.5 text-teal-700" />
                  Transport Alternative
                </span>
                <p className="text-stone-700 leading-snug">
                  Choose shared public transit or electric rail when commuting to minimize vehicle emissions.
                </p>
              </div>
            )}
          </div>

          {/* 5. Expandable "How we calculated this" details */}
          <details className="border border-stone-200 rounded-xl p-3 bg-stone-50/50 text-xs text-stone-600">
            <summary className="cursor-pointer font-semibold text-stone-700 select-none flex items-center justify-between">
              <span>How we calculated this (sources, units &amp; assumptions)</span>
              <span className="text-[11px] text-stone-400">Click to expand</span>
            </summary>

            <div className="pt-2 mt-2 border-t border-stone-200/60 space-y-2">
              <div>
                <strong className="text-stone-800">Forecast source:</strong> Copernicus Atmosphere
                Monitoring Service (CAMS) regional model via Open-Meteo.
              </div>
              <div>
                <strong className="text-stone-800">Pollution measure:</strong> Fine particulate matter
                (PM₂.₅ in µg/m³) and US Air Quality Index (0–500 scale).
              </div>
              <div>
                <strong className="text-stone-800">Schedule logic:</strong> Evaluated all hours in the
                requested window where the full duration fits without overlapping fixed commitments,
                selecting the hour with the lowest forecast PM₂.₅.
              </div>
              {factsResult.transportComparison && (
                <div>
                  <strong className="text-stone-800">Emissions factor:</strong>{" "}
                  {factsResult.transportComparison.factorSource}. {factsResult.transportComparison.assumptions}
                </div>
              )}
            </div>
          </details>
        </div>
      )}
    </section>
  );
}

function TimeWindow({
  label,
  start,
  end,
  zone,
  onChange,
}: {
  label: string;
  start: string;
  end: string;
  zone: string;
  onChange: (start: string, end: string) => void;
}) {
  return (
    <fieldset className="flex flex-wrap items-center gap-2 text-xs text-stone-700">
      <legend className="sr-only">{label} times · {zone}</legend>
      {(["start", "end"] as const).map((edge) => (
        <label key={edge} className="flex items-center gap-1 text-[11px]">
          <span className="text-stone-500 font-medium capitalize">{label} {edge}</span>
          <input
            type="datetime-local"
            required
            value={edge === "start" ? start : end}
            className="rounded bg-white border border-stone-200 px-2 py-1 text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-teal-700"
            onChange={(event) =>
              edge === "start" ? onChange(event.target.value, end) : onChange(start, event.target.value)
            }
          />
        </label>
      ))}
    </fieldset>
  );
}
