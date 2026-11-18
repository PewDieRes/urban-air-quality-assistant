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

  // Household & Budget
  const [sensitiveMembers, setSensitiveMembers] = useState<boolean>(true);
  const [hasAirPurifier, setHasAirPurifier] = useState<boolean>(true);
  const [budgetLevel, setBudgetLevel] = useState<"low" | "medium" | "high">("medium");

  // Plan generation state
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [factsResult, setFactsResult] = useState<PlanFacts | null>(null);
  const [narrativeResult, setNarrativeResult] = useState<PlanNarrative | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);

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
        if (parsed.sensitiveMembers !== undefined) setSensitiveMembers(parsed.sensitiveMembers);
        if (parsed.hasAirPurifier !== undefined) setHasAirPurifier(parsed.hasAirPurifier);
        if (parsed.budgetLevel) setBudgetLevel(parsed.budgetLevel);
      }
    } catch (e) {
      // Ignore storage errors
    }
  }, []);

  // Save preferences to localStorage on change
  const savePreferences = () => {
    try {
      const prefs = {
        transportMode,
        distanceKm,
        sensitiveMembers,
        hasAirPurifier,
        budgetLevel,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch (e) {
      // Ignore storage errors
    }
  };

  const handleAddActivity = () => {
    if (!forecast || !forecast.hourly.length) return;
    const newAct: FlexibleActivity = {
      id: `act-${Date.now()}`,
      title: "Outdoor walk / workout",
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

  const handleBuildPlan = async (e: React.FormEvent) => {
    e.preventDefault();
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
      household: {
        sensitiveMembers,
        hasAirPurifier,
      },
      budget: budgetLevel,
    };

    // Deterministic client calculation as immediate baseline
    const calculatedFacts = computePlanFacts(planInput, forecast);
    setFactsResult(calculatedFacts);

    try {
      // Request grounded Gemini narrative via server route
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
      if (data.facts) {
        setFactsResult(data.facts);
      }
      if (data.narrative) {
        setNarrativeResult(data.narrative);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Plan generation unavailable";
      setGenerationError(msg);
      // Fallback: facts remain calculated and displayed deterministically!
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
            Compare forecast hours, protect family health, and find lower-emission alternatives.
          </p>
        </div>
      </div>

      <form onSubmit={handleBuildPlan} className="mt-6 space-y-6">
        {/* Step 1: Flexible Activities */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-400" />
              1. Flexible Activities (We find the cleanest hour)
            </label>
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
            {activities.map((activity, index) => (
              <div
                key={activity.id}
                className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 flex flex-wrap items-center gap-3"
              >
                <div className="flex-1 min-w-[200px]">
                  <label className="text-[11px] text-slate-400 block mb-1">
                    Activity Title
                  </label>
                  <input
                    type="text"
                    value={activity.title}
                    onChange={(e) => {
                      const val = e.target.value;
                      setActivities(
                        activities.map((a) => (a.id === activity.id ? { ...a, title: val } : a))
                      );
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200"
                    placeholder="e.g. Grocery trip, Jogging"
                    required
                  />
                </div>

                <div className="w-36">
                  <label className="text-[11px] text-slate-400 block mb-1">
                    Duration
                  </label>
                  <select
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
            <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Clock className="w-4 h-4 text-sky-400" />
              2. Fixed Commitments (Cannot be moved)
            </label>
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
                  <input
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
                  Preserved in plan
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

        {/* Step 3: Transport & Household Preferences */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Car className="w-4 h-4 text-amber-400" />
              Transport & Distance (Optional)
            </label>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">
                  Primary Mode
                </label>
                <select
                  value={transportMode}
                  onChange={(e) => setTransportMode(e.target.value as TransportMode)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                >
                  <option value="car">Gasoline Car</option>
                  <option value="transit">Public Transit / Metro</option>
                  <option value="ev">Electric Vehicle (EV)</option>
                  <option value="walk">Walking</option>
                  <option value="bike">Bicycle</option>
                  <option value="none">No Travel Needed</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">
                  Trip Distance (km)
                </label>
                <input
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
            <p className="text-[11px] text-slate-500">
              Only used to estimate emissions savings against lower-pollution modes.
            </p>
          </div>

          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Home className="w-4 h-4 text-purple-400" />
              Household Profile (Optional)
            </label>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sensitiveMembers}
                  onChange={(e) => setSensitiveMembers(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-emerald-500"
                />
                <span>Includes children, elderly, or respiratory-sensitive members</span>
              </label>

              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasAirPurifier}
                  onChange={(e) => setHasAirPurifier(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-emerald-500"
                />
                <span>Home is equipped with HEPA air purifier</span>
              </label>
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
                <span>Computing facts & grounded recommendations...</span>
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
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              Your Tailored Smog Routine ({timeZone})
            </h3>
            <span className="text-[11px] font-mono text-slate-500">
              Generated: {new Date(factsResult.generatedAt).toLocaleTimeString()}
            </span>
          </div>

          {/* Activities breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {factsResult.activities.map((act) => {
              const best = act.bestCandidate;
              const formattedTime = best
                ? formatHourlyTime(best.at, timeZone)
                : "No slot available";

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
                        Lowest Exposure
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
                  Preserved Fixed Commitments
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
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2 text-xs uppercase font-bold text-emerald-400">
                <Leaf className="w-4 h-4" />
                Sustainable Transport & Emission Impact
              </div>
              <p className="text-xs text-slate-300">
                {factsResult.transportComparison.explanation}
              </p>
              {factsResult.transportComparison.estimatedCo2KgSaved !== null &&
                factsResult.transportComparison.estimatedCo2KgSaved > 0 && (
                  <div className="mt-2 text-sm font-semibold text-emerald-300">
                    Estimated savings: ~{factsResult.transportComparison.estimatedCo2KgSaved} kg CO₂
                  </div>
                )}
            </div>
          )}

          {/* Indoor Air Recommendations */}
          {factsResult.indoorRecommendations.length > 0 && (
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs uppercase font-bold text-purple-400">
                <Shield className="w-4 h-4" />
                Indoor Air Protection Routine
              </div>
              <ul className="list-disc list-inside text-xs text-slate-300 space-y-1">
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
