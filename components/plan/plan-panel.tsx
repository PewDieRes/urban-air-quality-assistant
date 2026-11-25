"use client";

import React, { useRef } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { Forecast } from "@/lib/forecast/types";
import { usePlanPreferences } from "@/hooks/use-plan-preferences";
import { usePlanSubmission } from "@/hooks/use-plan-submission";
import { ActivityList } from "./activity-list";
import { CommitmentList } from "./commitment-list";
import { HouseholdTransportSettings } from "./household-transport-settings";
import { PlanResultView } from "./plan-result-view";

interface PlanPanelProps {
  forecast: Forecast | null;
  locationName: string;
  lat: number;
  lon: number;
}

/**
 * Household daily schedule planner panel coordinating fixed commitments,
 * flexible activity optimization, household preferences, and Gemini narratives.
 */
export function PlanPanel({ forecast, locationName, lat, lon }: PlanPanelProps) {
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const errorAlertRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  const preferences = usePlanPreferences();
  const submission = usePlanSubmission({
    forecast,
    locationName,
    lat,
    lon,
    preferences,
    resultHeadingRef,
    errorAlertRef,
    formRef,
    firstInputRef,
  });

  return (
    <section
      aria-labelledby="plan-my-day-heading"
      className="bg-white border border-stone-200/90 rounded-2xl p-5 shadow-sm text-stone-900"
    >
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {submission.liveStatusMessage}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pb-3.5 border-b border-stone-100">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200/60">
              Planner
            </span>
            <span className="text-xs text-stone-500 font-mono">
              Schedule in {submission.timeZone}
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

      {submission.inputError && (
        <div
          ref={errorAlertRef}
          tabIndex={-1}
          role="alert"
          className="scroll-mt-52 sm:scroll-mt-40 lg:scroll-mt-32 focus:outline-none focus:ring-2 focus:ring-rose-600 focus:ring-offset-1 mt-3 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">{submission.inputError}</p>
              {submission.availableRangeText && (
                <p className="mt-1 text-stone-600">
                  Available forecast range:{" "}
                  <span className="font-mono">{submission.availableRangeText}</span>
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <form
        ref={formRef}
        onSubmit={submission.handleBuildPlan}
        className="scroll-mt-52 sm:scroll-mt-40 lg:scroll-mt-32 mt-4 space-y-4"
      >
        <CommitmentList
          commitments={submission.fixedCommitments}
          timeZone={submission.timeZone}
          firstInputRef={firstInputRef}
          onAddCommitment={submission.addCommitment}
          onUpdateCommitment={submission.updateCommitment}
          onRemoveCommitment={submission.removeCommitment}
        />

        <ActivityList
          activities={submission.activities}
          timeZone={submission.timeZone}
          onAddActivity={submission.addActivity}
          onUpdateActivity={submission.updateActivity}
          onRemoveActivity={submission.removeActivity}
        />

        <HouseholdTransportSettings preferences={preferences} />

        <div>
          <button
            type="submit"
            disabled={submission.isGenerating}
            className="w-full py-2.5 px-4 bg-teal-800 hover:bg-teal-900 text-white font-medium rounded-xl text-sm shadow-sm flex items-center justify-center gap-2 transition disabled:opacity-50"
          >
            {submission.isGenerating ? (
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

      {submission.factsResult && (
        <div className="scroll-mt-24 mt-6 pt-5 border-t border-stone-200">
          <PlanResultView
            facts={submission.factsResult}
            narrative={submission.narrativeResult}
            planStatus={submission.planStatus}
            modelUsed={submission.modelUsed}
            timeZone={submission.timeZone}
            isGenerating={submission.isGenerating}
            resultHeadingRef={resultHeadingRef}
            onRetryGemini={() => submission.handleBuildPlan()}
            onEditInputs={submission.scrollToForm}
            defaultTransportAdvice={preferences.defaultTransportAdvice}
          />
        </div>
      )}
    </section>
  );
}
