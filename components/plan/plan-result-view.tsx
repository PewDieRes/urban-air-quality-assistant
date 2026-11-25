import React from "react";
import { RefreshCw, Shield, Leaf, Edit3 } from "lucide-react";
import { PlanFacts, PlanNarrative } from "@/lib/plan/types";
import { derivePlanDecision } from "@/lib/plan/decision";
import { formatPm25Value } from "@/lib/plan/facts";
import { formatHourlyTime } from "@/lib/forecast/open-meteo";

export interface PlanResultViewProps {
  facts: PlanFacts;
  narrative: PlanNarrative | null;
  planStatus: "gemini_generated" | "deterministic_fallback" | "pending" | null;
  modelUsed: string | null;
  timeZone: string;
  isGenerating: boolean;
  resultHeadingRef: React.RefObject<HTMLHeadingElement | null>;
  onRetryGemini: () => void;
  onEditInputs: () => void;
  defaultTransportAdvice: string;
}

export function PlanResultView({
  facts,
  narrative,
  planStatus,
  timeZone,
  isGenerating,
  resultHeadingRef,
  onRetryGemini,
  onEditInputs,
  defaultTransportAdvice,
}: PlanResultViewProps) {
  const decisionOutput = derivePlanDecision(facts, timeZone);

  const geminiIndoor =
    planStatus === "gemini_generated" && narrative
      ? narrative.items?.find((i) => i.category === "indoor")
      : null;

  const geminiTransport =
    planStatus === "gemini_generated" && narrative
      ? narrative.items?.find((i) => i.category === "transport")
      : null;

  const displayedIndoorAction =
    planStatus === "gemini_generated" && geminiIndoor
      ? geminiIndoor.action
      : facts.indoorRecommendations[0] ||
        "Keep exterior windows closed during high forecast PM₂.₅ hours.";

  const displayedIndoorWhy =
    planStatus === "gemini_generated" && geminiIndoor?.whyItHelps
      ? geminiIndoor.whyItHelps
      : "Reduces fine particulate matter (PM₂.₅) entering indoor breathing zones.";

  const displayedIndoorBeneficiary =
    planStatus === "gemini_generated" && geminiIndoor?.beneficiary
      ? geminiIndoor.beneficiary
      : facts.indoorRecommendations.length > 1
      ? "Children, older adults, and sensitive household members"
      : "All household occupants";

  const tc = facts.transportComparison;
  const hasQuantifiedCo2 =
    tc?.estimatedCo2KgSaved !== null &&
    tc?.estimatedCo2KgSaved !== undefined &&
    tc.estimatedCo2KgSaved > 0;
  const hasMissingInputs = Boolean(tc?.missingInputs && tc.missingInputs.length > 0 && !hasQuantifiedCo2);

  const transportBadgeText = hasQuantifiedCo2
    ? "Est. emissions"
    : hasMissingInputs
    ? "Missing input"
    : "Exposure guidance";

  const displayedTransportText =
    planStatus === "gemini_generated" && geminiTransport
      ? `${geminiTransport.action} ${geminiTransport.whyItHelps}`
      : tc?.explanation || defaultTransportAdvice;

  const displayedTransportBeneficiary =
    planStatus === "gemini_generated" && geminiTransport?.beneficiary
      ? geminiTransport.beneficiary
      : tc?.beneficiary || "Household traveler";

  if (!decisionOutput) return null;

  return (
    <div className="space-y-4 pt-2">
      {/* Result Section Header with Status Controls */}
      <div className="flex items-center justify-between gap-3 border-b border-stone-200/80 pb-3">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-teal-700" />
          <h2 className="text-sm font-bold text-stone-900 tracking-tight">
            Recommended Household Schedule
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onEditInputs}
            className="flex items-center gap-1 text-[11px] font-medium text-teal-800 hover:text-teal-900 bg-teal-50 px-2 py-0.5 rounded border border-teal-200/60 transition"
            aria-label="Edit schedule inputs"
          >
            <Edit3 className="w-3 h-3" />
            <span>Edit inputs</span>
          </button>

          {planStatus === "deterministic_fallback" && (
            <button
              type="button"
              onClick={onRetryGemini}
              disabled={isGenerating}
              className="flex items-center gap-1 text-[11px] text-teal-800 hover:text-teal-900 font-medium"
            >
              <RefreshCw className={`w-3 h-3 ${isGenerating ? "animate-spin" : ""}`} />
              <span>Retry with Gemini</span>
            </button>
          )}
        </div>
      </div>

      {/* 1. Primary Decision Headline & Metric-Explicit Concentration Explanation */}
      <div className="bg-teal-50/60 border border-teal-200/80 rounded-xl p-4">
        <h3
          ref={resultHeadingRef}
          tabIndex={-1}
          className="scroll-mt-24 focus:outline-none text-lg font-bold text-teal-950 tracking-tight"
        >
          {decisionOutput.headline}
        </h3>
        <p className="text-xs text-stone-700 mt-1 leading-relaxed">
          {decisionOutput.explanation}
        </p>
      </div>

      {/* 2. Short Timeline: Fixed Commitment + Flexible Activity */}
      <div className="bg-stone-50 border border-stone-200/80 rounded-xl p-3.5 space-y-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500 block">
          Day Schedule Timeline
        </span>

        <div className="space-y-2 text-xs">
          {/* Fixed commitments */}
          {facts.fixedCommitments.map((fix) => (
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
          {facts.activities.map((act) => {
            const best = act.bestCandidate;
            const startTime = best
              ? formatHourlyTime(best.at, timeZone)
              : "No eligible slot";
            const endTime = best
              ? formatHourlyTime(
                  new Date(Date.parse(best.at) + (act.durationMinutes || 60) * 60000).toISOString(),
                  timeZone
                )
              : "";
            const rawMean = best ? (best.durationMeanPm25 ?? best.pm25) : null;
            const durLabel = act.durationMinutes === 60 ? "1h mean" : `${act.durationMinutes}m mean`;
            const meanStr =
              rawMean !== null && rawMean !== undefined
                ? `${formatPm25Value(rawMean)} µg/m³ (${durLabel})`
                : "";
            const startHrVal = best?.startHourPm25;
            const showSeparateStartHour =
              best &&
              startHrVal !== null &&
              startHrVal !== undefined &&
              rawMean !== null &&
              rawMean !== undefined &&
              Math.abs(startHrVal - rawMean) > 0.05;

            return (
              <div
                key={act.id}
                className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-lg bg-teal-50/50 border border-teal-200"
              >
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-teal-600" />
                  <span className="font-semibold text-teal-950">{act.title}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-bold text-teal-900 font-mono">
                    <span>{startTime}</span>
                    {endTime && (
                      <>
                        {" "}– <span>{endTime}</span>
                      </>
                    )}
                  </span>
                  {meanStr && (
                    <span
                      data-testid="activity-duration-mean"
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-teal-100 text-teal-800"
                    >
                      {meanStr}
                    </span>
                  )}
                  {showSeparateStartHour && (
                    <span
                      data-testid="activity-start-hour-pm25"
                      className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-white text-stone-600 border border-stone-200"
                    >
                      Start hr: {formatPm25Value(startHrVal)} µg/m³
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Household Indoor Action & Feasible Transport Alternative */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        {/* Indoor action */}
        <div className="p-3.5 rounded-xl bg-white border border-stone-200 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-stone-600 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-stone-600" />
              Indoor Action
            </span>
            <span
              data-testid="plan-status-badge"
              className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                planStatus === "gemini_generated"
                  ? "bg-teal-50 text-teal-800 border border-teal-200"
                  : planStatus === "pending"
                  ? "bg-amber-50 text-amber-800 border border-amber-200"
                  : "bg-stone-100 text-stone-700 border border-stone-200"
              }`}
            >
              {planStatus === "gemini_generated"
                ? "Explained by Gemini"
                : planStatus === "pending"
                ? "Checking Gemini..."
                : "Forecast-based plan"}
            </span>
          </div>
          <p
            className="text-stone-800 font-medium leading-relaxed"
            data-testid="household-indoor-action"
          >
            {displayedIndoorAction}
          </p>
          <p className="text-stone-500 text-[11px] leading-snug">
            {displayedIndoorWhy} Benefits: {displayedIndoorBeneficiary}.
          </p>
        </div>

        {/* Transport alternative */}
        <div className="p-3.5 rounded-xl bg-white border border-stone-200 space-y-1.5" data-testid="transport-card">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-stone-600 flex items-center gap-1.5">
              <Leaf className="w-3.5 h-3.5 text-teal-700" />
              Transport Alternative
            </span>
            <span
              data-testid="transport-type-badge"
              className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-stone-100 text-stone-600"
            >
              {transportBadgeText}
            </span>
          </div>
          <p className="text-stone-800 leading-snug" data-testid="household-transport-explanation">
            {displayedTransportText}
          </p>
          <p className="text-stone-500 text-[11px] leading-snug">
            Benefits: {displayedTransportBeneficiary}.
          </p>
          {hasQuantifiedCo2 && tc && (
            <span
              data-testid="transport-co2-estimate"
              className="inline-block text-[11px] font-medium text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200/60"
            >
              Est. savings: {tc.estimatedCo2KgSaved} {tc.units}
              {tc.factorMetadata?.isOutsideReferenceGeography ? " (UK ref.)" : ""}
            </span>
          )}
          {hasMissingInputs && tc?.missingInputs && (
            <span
              data-testid="transport-missing-inputs"
              className="inline-block text-[11px] font-medium text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/80"
            >
              Needs: {tc.missingInputs.join(", ")}
            </span>
          )}
        </div>
      </div>

      {/* 4. Expandable Calculation Details, Factor Sources & Scope Boundaries */}
      <details className="border border-stone-200 rounded-xl p-3 bg-stone-50/50 text-xs text-stone-600">
        <summary className="cursor-pointer font-semibold text-stone-700 select-none flex items-center justify-between">
          <span>How we calculated this (sources, units &amp; assumptions)</span>
          <span className="text-[11px] text-stone-400">Click to expand</span>
        </summary>

        <div className="pt-2 mt-2 border-t border-stone-200/60 space-y-2">
          <div>
            <strong className="text-stone-800">Forecast source:</strong> Copernicus Atmosphere
            Monitoring Service (CAMS) regional model via Open-Meteo (stored as UTC instants,
            displayed in {timeZone}).
          </div>
          <div>
            <strong className="text-stone-800">Duration-weighted ranking metric:</strong>{" "}
            Time-weighted mean forecast PM₂.₅ (µg/m³) across every minute of the full activity
            duration, using identical metrics for baseline and optimized slots. Candidates with any
            missing forecast interval are excluded.
          </div>
          <div>
            <strong className="text-stone-800">Concentration vs. exposure &amp; scope:</strong>{" "}
            Percentage comparisons measure outdoor forecast PM₂.₅ concentration only. Personal
            inhaled dose depends on exertion, masks, and indoor/vehicle filtration, which are not
            measured. One household&apos;s trip does not measurably change citywide AQI.
          </div>
          {tc && (
            <div className="space-y-1">
              <div>
                <strong className="text-stone-800">Transport calculation:</strong>{" "}
                {tc.factorSource}. {tc.assumptions}
              </div>
              {tc.factorMetadata && (
                <div className="text-[11px] text-stone-500">
                  Source: {tc.factorMetadata.publication} ({tc.factorMetadata.year}) · Geography:{" "}
                  {tc.factorMetadata.geography} · Baseline:{" "}
                  {tc.factorMetadata.baselineModeFactor} · Alternative:{" "}
                  {tc.factorMetadata.alternativeModeFactor} · Occupancy:{" "}
                  {tc.factorMetadata.occupancyAssumption}.
                </div>
              )}
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
