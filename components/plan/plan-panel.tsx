"use client";

import React, { useState, useEffect } from "react";
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
import { formatHourlyTime } from "@/lib/forecast/open-meteo";
import {
  Sparkles,
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
  TrendingDown,
  Cpu,
} from "lucide-react";

interface PlanPanelProps {
  forecast: Forecast | null;
  locationName: string;
  lat: number;
  lon: number;
}

const STORAGE_KEY = "urban_aq_plan_prefs";

export function PlanPanel({ forecast, locationName, lat, lon }: PlanPanelProps) {
  // Activity state
  const [activities, setActivities] = useState<FlexibleActivity[]>([
    {
      id: "act-1",
      title: "Grocery Shopping & Errands",
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

  // Clear previous generated results when location coordinates or name changes
  useEffect(() => {
    setFactsResult(null);
    setNarrativeResult(null);
    setPlanStatus(null);
    setModelUsed(null);
    setGenerationError(null);
  }, [lat, lon, locationName]);

  // Initialize default window dates when forecast loads
  useEffect(() => {
    if (forecast && forecast.hourly && forecast.hourly.length > 0) {
      const firstHour = forecast.hourly[0].at;
      const sixthHour = forecast.hourly[Math.min(6, forecast.hourly.length - 1)].at;
      const secondHour = forecast.hourly[Math.min(2, forecast.hourly.length - 1)].at;
      const thirdHour = forecast.hourly[Math.min(3, forecast.hourly.length - 1)].at;

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
  }, [forecast]);

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
    if (!forecast || !forecast.hourly.length) return;
    const newAct: FlexibleActivity = {
      id: `act-${Date.now()}`,
      title: "Outdoor walk / errand",
      windowStart: forecast.hourly[0].at,
      windowEnd: forecast.hourly[Math.min(10, forecast.hourly.length - 1)].at,
      durationMinutes: 45,
    };
    setActivities([...activities, newAct]);
  };

  const handleRemoveActivity = (id: string) => {
    if (activities.length > 1) {
      setActivities(activities.filter((a) => a.id !== id));
    }
  };

  const handleAddCommitment = () => {
    if (!forecast || !forecast.hourly.length) return;
    const newComm: FixedCommitment = {
      id: `fix-${Date.now()}`,
      title: "Work / Doctor appointment",
      start: forecast.hourly[1].at,
      end: forecast.hourly[2].at,
    };
    setFixedCommitments([...fixedCommitments, newComm]);
  };

  const handleRemoveCommitment = (id: string) => {
    setFixedCommitments(fixedCommitments.filter((f) => f.id !== id));
  };

  const handleBuildPlan = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!forecast) return;

    savePreferences();
    setIsGenerating(true);
    setGenerationError(null);

    const distNum = parseFloat(distanceKm);
    const planInput: PlanInput = {
      activities,
      fixedCommitments,
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

    // Immediate client-side calculation to guarantee verified facts
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

  return (
    <section
      aria-labelledby="household-plan-heading"
      className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-2xl backdrop-blur-md"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 pb-5 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              <Sparkles className="w-3.5 h-3.5" />
              GenAI Household Assistant
            </span>
            <span className="text-xs text-slate-400 font-mono">
              Ground truth: Open-Meteo
            </span>
          </div>
          <h2
            id="household-plan-heading"
            className="text-xl font-bold text-slate-100 mt-1"
          >
            Build My Smog Plan · {locationName}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Compare forecast hours, protect family health, and find lower-emission alternatives in {timeZone}.
          </p>
        </div>
      </div>

      <form onSubmit={handleBuildPlan} className="mt-6 space-y-6">
        {/* Step 1: Flexible Activities */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-400" />
              1. Flexible Activities (We find the hour with lower forecast PM₂.₅)
            </span>
            <button
              type="button"
              onClick={handleAddActivity}
              className="flex items-center gap-1 text-xs font-medium text-emerald-400 hover:text-emerald-300 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Activity
            </button>
          </div>

          <div className="space-y-3">
            {activities.map((activity) => (
              <div
                key={activity.id}
                className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 flex flex-wrap items-center gap-3"
              >
                <div className="flex-1 min-w-[200px]">
                  <label
                    htmlFor={`act-title-${activity.id}`}
                    className="text-[11px] text-slate-400 block mb-1 font-medium"
                  >
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
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200"
                    placeholder="e.g. Grocery trip, Exercise"
                    required
                  />
                </div>

                <div className="w-36">
                  <label
                    htmlFor={`act-dur-${activity.id}`}
                    className="text-[11px] text-slate-400 block mb-1 font-medium"
                  >
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
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                  >
                    <option value={30}>30 mins</option>
                    <option value={60}>1 hour</option>
                    <option value={90}>1.5 hours</option>
                    <option value={120}>2 hours</option>
                  </select>
                </div>

                {activities.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveActivity(activity.id)}
                    aria-label={`Remove activity ${activity.title}`}
                    className="p-1.5 text-slate-500 hover:text-rose-400 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step 2: Fixed Commitments */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Clock className="w-4 h-4 text-sky-400" />
              2. Fixed Commitments (Strictly avoided when scheduling)
            </span>
            <button
              type="button"
              onClick={handleAddCommitment}
              className="flex items-center gap-1 text-xs font-medium text-sky-400 hover:text-sky-300 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Commitment
            </button>
          </div>

          <div className="space-y-2">
            {fixedCommitments.map((commitment) => (
              <div
                key={commitment.id}
                className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 flex flex-wrap items-center gap-3"
              >
                <div className="flex-1 min-w-[200px]">
                  <label
                    htmlFor={`comm-title-${commitment.id}`}
                    className="sr-only"
                  >
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
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200"
                    placeholder="e.g. School pickup, Work shift"
                  />
                </div>
                <span className="text-xs text-slate-400 font-mono">
                  Preserved in plan ({timeZone})
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveCommitment(commitment.id)}
                  aria-label={`Remove commitment ${commitment.title}`}
                  className="p-1 text-slate-500 hover:text-rose-400 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Step 3: Transport & Available Alternatives */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Car className="w-4 h-4 text-amber-400" />
              Transport & Distance (Optional)
            </span>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="primary-transport-mode"
                  className="text-[11px] text-slate-400 block mb-1 font-medium"
                >
                  Primary Travel Mode
                </label>
                <select
                  id="primary-transport-mode"
                  value={transportMode}
                  onChange={(e) => setTransportMode(e.target.value as TransportMode)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
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
                <label
                  htmlFor="trip-distance-km"
                  className="text-[11px] text-slate-400 block mb-1 font-medium"
                >
                  Trip Distance (km)
                </label>
                <input
                  id="trip-distance-km"
                  type="number"
                  min="0"
                  max="150"
                  step="0.5"
                  value={distanceKm}
                  onChange={(e) => setDistanceKm(e.target.value)}
                  placeholder="e.g. 10"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                />
              </div>
            </div>

            {/* Available Transport Alternatives Checkboxes */}
            <div className="pt-2 border-t border-slate-800">
              <span className="text-[11px] text-slate-400 block mb-1.5 font-medium">
                Which transport alternatives are available to you?
              </span>
              <div className="flex flex-wrap gap-2 text-xs">
                {(["transit", "walk", "bike", "ev"] as TransportMode[]).map((mode) => (
                  <label
                    key={mode}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-900 border border-slate-800 cursor-pointer text-slate-300 hover:border-slate-700"
                  >
                    <input
                      type="checkbox"
                      checked={availableModes.includes(mode)}
                      onChange={() => handleToggleMode(mode)}
                      className="rounded border-slate-700 bg-slate-800 text-emerald-500 w-3.5 h-3.5"
                    />
                    <span className="capitalize">{mode === "transit" ? "Public Transit" : mode}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Household Profile & Budget */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Home className="w-4 h-4 text-purple-400" />
              Household & Budget Profile (Optional)
            </span>

            <div className="space-y-2.5">
              <label
                htmlFor="sensitive-members-check"
                className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer"
              >
                <input
                  id="sensitive-members-check"
                  type="checkbox"
                  checked={sensitiveMembers}
                  onChange={(e) => setSensitiveMembers(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-emerald-500 w-4 h-4"
                />
                <span>Includes children, elderly, or respiratory-sensitive members</span>
              </label>

              <label
                htmlFor="has-air-purifier-check"
                className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer"
              >
                <input
                  id="has-air-purifier-check"
                  type="checkbox"
                  checked={hasAirPurifier}
                  onChange={(e) => setHasAirPurifier(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-emerald-500 w-4 h-4"
                />
                <span>Home is equipped with HEPA air purifier</span>
              </label>

              <div>
                <label
                  htmlFor="budget-level-select"
                  className="text-[11px] text-slate-400 block mb-1 font-medium"
                >
                  Indoor Air Action Budget
                </label>
                <select
                  id="budget-level-select"
                  value={budgetLevel}
                  onChange={(e) => setBudgetLevel(e.target.value as "low" | "medium" | "high")}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                >
                  <option value="low">Low Budget (Damp cleaning, draught sealing, DIY measures)</option>
                  <option value="medium">Medium Budget (Portable HEPA filter / Corsi-Rosenthal box)</option>
                  <option value="high">High Budget (Multi-room HEPA purifiers, MERV 13 HVAC)</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={isGenerating}
            className="w-full py-3 bg-gradient-to-r from-emerald-600 via-teal-600 to-sky-600 hover:from-emerald-500 hover:to-sky-500 text-white font-semibold rounded-xl text-sm shadow-lg shadow-emerald-950 flex items-center justify-center gap-2 transition disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Computing verified facts & grounded recommendations...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Build My Smog Plan</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Plan Results Section */}
      {factsResult && (
        <div className="mt-8 pt-6 border-t border-slate-800 space-y-6">
          {/* Header with generation status badge and Retry option */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950/80 p-3.5 rounded-xl border border-slate-800">
            <div className="flex items-center gap-2.5">
              {planStatus === "gemini_generated" ? (
                <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  <Sparkles className="w-3.5 h-3.5" />
                  Generated by Gemini ({modelUsed || "gemini-3.8-flash"})
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30">
                  <Cpu className="w-3.5 h-3.5" />
                  Deterministic Grounded Plan (Fallback)
                </span>
              )}
              <span className="text-xs text-slate-400 font-mono">
                {timeZone}
              </span>
            </div>

            {planStatus === "deterministic_fallback" && (
              <button
                type="button"
                onClick={() => handleBuildPlan()}
                disabled={isGenerating}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1 bg-emerald-700/80 hover:bg-emerald-600 text-white rounded-lg border border-emerald-600/40 transition disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? "animate-spin" : ""}`} />
                <span>Retry with Gemini</span>
              </button>
            )}
          </div>

          {/* Demonstrable Before-and-After Comparison Card */}
          {factsResult.beforeAfterComparison && (
            <div className="bg-gradient-to-r from-emerald-950/40 to-teal-950/30 border border-emerald-500/30 rounded-xl p-4.5 shadow-lg">
              <div className="flex items-center gap-2 text-xs uppercase font-bold text-emerald-400 mb-2">
                <TrendingDown className="w-4 h-4" />
                Demonstrable Before-and-After Schedule Optimization
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-3">
                <div className="bg-slate-950/80 rounded-lg p-3 border border-slate-800">
                  <span className="text-[11px] text-slate-400 block">Baseline Routine</span>
                  <div className="text-sm font-semibold text-rose-300 mt-1">
                    {formatHourlyTime(factsResult.beforeAfterComparison.baselineTime, timeZone)}
                  </div>
                  <div className="text-xs text-slate-400 font-mono mt-0.5">
                    PM₂.₅: {factsResult.beforeAfterComparison.baselinePm25} µg/m³
                  </div>
                </div>

                <div className="bg-slate-950/80 rounded-lg p-3 border border-emerald-700/50">
                  <span className="text-[11px] text-emerald-400 font-semibold block">Recommended Routine</span>
                  <div className="text-sm font-bold text-emerald-300 mt-1">
                    {formatHourlyTime(factsResult.beforeAfterComparison.optimizedTime, timeZone)}
                  </div>
                  <div className="text-xs text-emerald-400 font-mono mt-0.5">
                    PM₂.₅: {factsResult.beforeAfterComparison.optimizedPm25} µg/m³
                  </div>
                </div>

                <div className="bg-slate-950/80 rounded-lg p-3 border border-slate-800 flex flex-col justify-center">
                  <span className="text-[11px] text-slate-400 block">Exposure Reduction</span>
                  <div className="text-xl font-extrabold text-emerald-400 mt-0.5">
                    -{factsResult.beforeAfterComparison.exposureReductionPercent}%
                  </div>
                  <span className="text-[10px] text-slate-400">lower forecast PM₂.₅</span>
                </div>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {factsResult.beforeAfterComparison.justification}
              </p>
            </div>
          )}

          {/* Activities breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {factsResult.activities.map((act) => {
              const best = act.bestCandidate;
              const formattedTime = best
                ? formatHourlyTime(best.at, timeZone)
                : "No eligible slot";

              return (
                <div
                  key={act.id}
                  className="bg-slate-950 border border-emerald-900/50 rounded-xl p-4 shadow-md flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs uppercase font-bold text-slate-400">
                        Recommended Hour
                      </span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
                        lower forecast PM₂.₅
                      </span>
                    </div>
                    <div className="text-base font-bold text-slate-100">
                      {act.title}
                    </div>
                    <div className="text-2xl font-extrabold text-emerald-400 my-1">
                      {formattedTime}
                    </div>
                    {best && (
                      <div className="text-xs text-slate-400 font-mono">
                        PM₂.₅: {best.pm25?.toFixed(0)} µg/m³ · US AQI: {best.usAqi ?? "—"}
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-slate-400 mt-3 pt-3 border-t border-slate-800">
                    {act.reason}
                  </p>
                </div>
              );
            })}

            {/* Preserved Fixed Commitments Card */}
            {factsResult.fixedCommitments.length > 0 && (
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                <span className="text-xs uppercase font-bold text-slate-400 block mb-2">
                  Preserved Fixed Commitments (Strictly avoided)
                </span>
                <div className="space-y-2">
                  {factsResult.fixedCommitments.map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center justify-between text-xs py-1 border-b border-slate-800/60 last:border-b-0"
                    >
                      <span className="font-medium text-slate-200">{f.title}</span>
                      <span className="text-sky-400 font-mono">
                        {formatHourlyTime(f.start, timeZone)} - {formatHourlyTime(f.end, timeZone)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Transport Comparison (Emissions vs Exposure) */}
          {factsResult.transportComparison && (
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs uppercase font-bold text-emerald-400">
                  <Leaf className="w-4 h-4" />
                  Sustainable Transport & Emissions Trade-off
                </div>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                  {factsResult.transportComparison.impactType === "lower_exposure"
                    ? "Personal Exposure Impact"
                    : "Community Emissions Impact"}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
                <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-slate-400 block text-[11px]">Baseline:</span>
                  <span className="text-slate-200 font-medium">{factsResult.transportComparison.baselineMode}</span>
                </div>
                <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-emerald-400 block text-[11px]">Alternative:</span>
                  <span className="text-emerald-300 font-medium">{factsResult.transportComparison.suggestedMode}</span>
                </div>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed pt-1">
                {factsResult.transportComparison.explanation}
              </p>

              <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 space-y-1">
                <div>
                  <span className="text-slate-500">Emission Factor Source:</span>{" "}
                  {factsResult.transportComparison.factorSource}
                </div>
                <div>
                  <span className="text-slate-500">Assumptions:</span>{" "}
                  {factsResult.transportComparison.assumptions}
                </div>
                {factsResult.transportComparison.estimatedCo2KgSaved !== null && (
                  <div className="text-xs font-semibold text-emerald-400 mt-1">
                    Claimed CO₂e savings: {factsResult.transportComparison.estimatedCo2KgSaved} {factsResult.transportComparison.units}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Indoor Air Recommendations */}
          {factsResult.indoorRecommendations.length > 0 && (
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs uppercase font-bold text-purple-400">
                <Shield className="w-4 h-4" />
                Tailored Indoor Air Protection Routine ({budgetLevel} budget)
              </div>
              <ul className="list-disc list-inside text-xs text-slate-300 space-y-1.5 leading-relaxed">
                {factsResult.indoorRecommendations.map((rec, i) => (
                  <li key={i}>{rec}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Grounded GenAI Narrative (when Gemini is available) */}
          {narrativeResult && (
            <div className="bg-emerald-950/20 border border-emerald-800/40 rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
                <Sparkles className="w-4 h-4" />
                Gemini Grounded Assessment
              </div>
              <p className="text-xs text-slate-200 leading-relaxed font-medium">
                {narrativeResult.summary}
              </p>

              <div className="space-y-2 pt-2">
                {narrativeResult.items.map((item) => (
                  <div
                    key={item.id}
                    className="bg-slate-900/60 rounded-lg p-3 text-xs border border-slate-800"
                  >
                    <div className="font-semibold text-slate-100">{item.action}</div>
                    <div className="text-slate-400 mt-0.5">{item.whyItHelps}</div>
                    <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-500">
                      <span>Beneficiary: {item.beneficiary}</span>
                      <span className="text-emerald-400 font-mono">
                        {item.impactType.replace("_", " ")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {generationError && (
            <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-xs text-slate-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                Model explanation currently unavailable: showing verified deterministic facts and candidate hours above. ({generationError})
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
