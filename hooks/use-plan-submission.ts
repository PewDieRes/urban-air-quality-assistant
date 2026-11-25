import { FormEvent, RefObject, useEffect, useMemo, useRef, useState } from "react";
import { formatHourlyTimeWithDate } from "@/lib/forecast/open-meteo";
import { Forecast } from "@/lib/forecast/types";
import { derivePlanDecision } from "@/lib/plan/decision";
import { computePlanFacts } from "@/lib/plan/facts";
import { cityClock, forecastRange, scheduleError } from "@/lib/plan/schedule";
import {
  FixedCommitment,
  FlexibleActivity,
  PlanFacts,
  PlanInput,
  PlanNarrative,
} from "@/lib/plan/types";
import { getPreferredScrollBehavior } from "@/lib/ui/scroll";
import { PlanPreferencesState } from "./use-plan-preferences";

export type PlanStatus = "gemini_generated" | "deterministic_fallback" | "pending" | null;

interface UsePlanSubmissionArgs {
  forecast: Forecast | null;
  locationName: string;
  lat: number;
  lon: number;
  preferences: PlanPreferencesState;
  resultHeadingRef: RefObject<HTMLHeadingElement | null>;
  errorAlertRef: RefObject<HTMLDivElement | null>;
  formRef: RefObject<HTMLFormElement | null>;
  firstInputRef: RefObject<HTMLInputElement | null>;
}

const DEFAULT_ACTIVITY: FlexibleActivity = {
  id: "act-1",
  title: "Grocery shopping",
  windowStart: "",
  windowEnd: "",
  durationMinutes: 60,
};

const DEFAULT_COMMITMENT: FixedCommitment = {
  id: "fix-1",
  title: "School pickup",
  start: "",
  end: "",
};

function parsePositiveFloat(rawValue: string): number | undefined {
  const parsed = parseFloat(rawValue);
  return !Number.isNaN(parsed) && parsed > 0 ? parsed : undefined;
}

function parsePositiveInt(rawValue: string): number | undefined {
  const parsed = parseInt(rawValue, 10);
  return !Number.isNaN(parsed) && parsed >= 1 ? parsed : undefined;
}

/**
 * Coordinates schedule inputs, immediate local constraint evaluation,
 * abort-guarded /api/plan calls, and accessible focus management.
 */
export function usePlanSubmission({
  forecast,
  locationName,
  lat,
  lon,
  preferences,
  resultHeadingRef,
  errorAlertRef,
  formRef,
  firstInputRef,
}: UsePlanSubmissionArgs) {
  const clock = useMemo(() => (forecast ? cityClock(forecast) : null), [forecast]);
  const range = useMemo(() => (forecast ? forecastRange(forecast) : null), [forecast]);
  const timeZone = forecast?.timeZone || "UTC";

  const initializedDefaultsRef = useRef(false);
  const submissionSequenceRef = useRef<number>(0);
  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [inputError, setInputError] = useState<string | null>(null);
  const [activities, setActivities] = useState<FlexibleActivity[]>([DEFAULT_ACTIVITY]);
  const [fixedCommitments, setFixedCommitments] = useState<FixedCommitment[]>([DEFAULT_COMMITMENT]);

  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [planStatus, setPlanStatus] = useState<PlanStatus>(null);
  const [modelUsed, setModelUsed] = useState<string | null>(null);
  const [factsResult, setFactsResult] = useState<PlanFacts | null>(null);
  const [narrativeResult, setNarrativeResult] = useState<PlanNarrative | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      activeAbortControllerRef.current?.abort();
      if (focusTimerRef.current) {
        clearTimeout(focusTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    activeAbortControllerRef.current?.abort();
    setFactsResult(null);
    setNarrativeResult(null);
    setPlanStatus(null);
    setModelUsed(null);
    setGenerationError(null);
  }, [lat, lon, locationName]);

  useEffect(() => {
    if (!clock?.range || !forecast || initializedDefaultsRef.current) {
      return;
    }
    initializedDefaultsRef.current = true;
    const { start, end } = clock.range;
    const clampHour = (hoursAhead: number) =>
      clock.local(Math.min(end, start + hoursAhead * 3600000));

    const firstHour = clock.local(start);
    const secondHour = clock.local(Math.min(end - 3600000, start + 2 * 3600000));
    const thirdHour = clampHour(3);
    const sixthHour = clampHour(6);

    setActivities((previous) =>
      previous.map((activity) => ({
        ...activity,
        windowStart: activity.windowStart || firstHour,
        windowEnd: activity.windowEnd || sixthHour,
      }))
    );

    setFixedCommitments((previous) =>
      previous.map((commitment) => ({
        ...commitment,
        start: commitment.start || secondHour,
        end: commitment.end || thirdHour,
      }))
    );
  }, [clock, forecast]);

  const addActivity = () => {
    if (!forecast || !clock?.range) {
      return;
    }
    const newActivity: FlexibleActivity = {
      id: `act-${Date.now()}`,
      title: "Outdoor walk / errand",
      windowStart: clock.local(clock.range.start),
      windowEnd: clock.local(Math.min(clock.range.end, clock.range.start + 6 * 3600000)),
      durationMinutes: 60,
    };
    setActivities((previous) => [...previous, newActivity]);
  };

  const updateActivity = (activityId: string, patch: Partial<FlexibleActivity>) => {
    setActivities((previous) =>
      previous.map((activity) => (activity.id === activityId ? { ...activity, ...patch } : activity))
    );
  };

  const removeActivity = (activityId: string) => {
    setActivities((previous) =>
      previous.length > 1 ? previous.filter((activity) => activity.id !== activityId) : previous
    );
  };

  const addCommitment = () => {
    if (!forecast || !clock?.range) {
      return;
    }
    const newCommitment: FixedCommitment = {
      id: `fix-${Date.now()}`,
      title: "Work appointment",
      start: clock.local(clock.range.start),
      end: clock.local(Math.min(clock.range.end, clock.range.start + 3600000)),
    };
    setFixedCommitments((previous) => [...previous, newCommitment]);
  };

  const updateCommitment = (commitmentId: string, patch: Partial<FixedCommitment>) => {
    setFixedCommitments((previous) =>
      previous.map((commitment) =>
        commitment.id === commitmentId ? { ...commitment, ...patch } : commitment
      )
    );
  };

  const removeCommitment = (commitmentId: string) => {
    setFixedCommitments((previous) =>
      previous.filter((commitment) => commitment.id !== commitmentId)
    );
  };

  const focusValidationAlert = () => {
    if (focusTimerRef.current) {
      clearTimeout(focusTimerRef.current);
    }
    focusTimerRef.current = setTimeout(() => {
      errorAlertRef.current?.focus({ preventScroll: true });
      errorAlertRef.current?.scrollIntoView({
        behavior: getPreferredScrollBehavior(),
        block: "start",
      });
    }, 50);
  };

  const handleBuildPlan = async (event?: FormEvent) => {
    if (event) {
      event.preventDefault();
    }
    if (!forecast || !clock) {
      return;
    }

    let schedule: Pick<PlanInput, "activities" | "fixedCommitments">;
    try {
      schedule = {
        activities: activities.map((activity) => ({
          ...activity,
          windowStart: clock.instant(activity.windowStart),
          windowEnd: clock.instant(activity.windowEnd),
        })),
        fixedCommitments: fixedCommitments.map((commitment) => ({
          ...commitment,
          start: clock.instant(commitment.start),
          end: clock.instant(commitment.end),
        })),
      };
      const problemMessage = scheduleError(schedule, forecast);
      if (problemMessage) {
        throw new Error(problemMessage);
      }
    } catch (validationError: unknown) {
      const message =
        validationError instanceof Error ? validationError.message : "Check your schedule.";
      setInputError(message);
      focusValidationAlert();
      return;
    }

    setInputError(null);
    preferences.savePreferences();

    activeAbortControllerRef.current?.abort();
    const abortController = new AbortController();
    activeAbortControllerRef.current = abortController;
    const submissionSequence = ++submissionSequenceRef.current;

    const planInput: PlanInput = {
      ...schedule,
      transport: {
        mode: preferences.transportMode,
        distanceKm: parsePositiveFloat(preferences.distanceKm),
        carpoolOccupancy: parsePositiveInt(preferences.carpoolOccupancy),
        avoidedVehicleKm: parsePositiveFloat(preferences.avoidedVehicleKm),
      },
      availableTransportModes: preferences.availableModes,
      household: {
        sensitiveMembers: preferences.sensitiveMembers,
        hasAirPurifier: preferences.hasAirPurifier,
      },
      budget: preferences.budgetLevel,
    };

    const computedFacts = computePlanFacts(planInput, forecast);
    setFactsResult(computedFacts);
    setNarrativeResult(null);
    setModelUsed(null);
    setGenerationError(null);
    setPlanStatus("pending");
    setIsGenerating(true);

    try {
      const response = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lon, input: planInput }),
        signal: abortController.signal,
      });

      if (submissionSequence !== submissionSequenceRef.current || abortController.signal.aborted) {
        return;
      }

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(
          errorPayload.error?.message || `Generation returned status ${response.status}`
        );
      }

      const responseData = (await response.json()) as {
        status?: PlanStatus;
        modelUsed?: string | null;
        facts?: PlanFacts;
        narrative?: PlanNarrative;
      };
      if (submissionSequence !== submissionSequenceRef.current || abortController.signal.aborted) {
        return;
      }

      setPlanStatus(responseData.status || "deterministic_fallback");
      setModelUsed(responseData.modelUsed || null);
      if (responseData.facts) {
        setFactsResult(responseData.facts);
      }
      if (responseData.narrative) {
        setNarrativeResult(responseData.narrative);
      }
    } catch (requestError: unknown) {
      if (submissionSequence !== submissionSequenceRef.current || abortController.signal.aborted) {
        return;
      }
      const message =
        requestError instanceof Error ? requestError.message : "Plan generation unavailable";
      setGenerationError(message);
      setPlanStatus("deterministic_fallback");
      setModelUsed(null);
      setNarrativeResult(null);
    } finally {
      if (submissionSequence === submissionSequenceRef.current) {
        setIsGenerating(false);
        if (focusTimerRef.current) {
          clearTimeout(focusTimerRef.current);
        }
        focusTimerRef.current = setTimeout(() => {
          if (submissionSequence === submissionSequenceRef.current) {
            resultHeadingRef.current?.focus({ preventScroll: true });
            resultHeadingRef.current?.scrollIntoView({
              behavior: getPreferredScrollBehavior(),
              block: "start",
            });
          }
        }, 100);
      }
    }
  };

  const scrollToForm = () => {
    firstInputRef.current?.focus({ preventScroll: true });
    formRef.current?.scrollIntoView({
      behavior: getPreferredScrollBehavior(),
      block: "start",
    });
  };

  const availableRangeText = useMemo(() => {
    if (!range) {
      return "";
    }
    const startLabel = formatHourlyTimeWithDate(
      new Date(range.start).toISOString(),
      timeZone
    ).full;
    const endLabel = formatHourlyTimeWithDate(new Date(range.end).toISOString(), timeZone).full;
    return `${startLabel} to ${endLabel}`;
  }, [range, timeZone]);

  const liveStatusMessage = useMemo(() => {
    if (isGenerating) {
      return "Finding lowest-pollution hour and checking Gemini explanation.";
    }
    if (factsResult && planStatus && planStatus !== "pending") {
      const decision = derivePlanDecision(factsResult, timeZone);
      const badgeLabel =
        planStatus === "gemini_generated" ? "Explained by Gemini." : "Forecast-based plan.";
      return decision ? `Plan ready: ${decision.headline}. ${badgeLabel}` : badgeLabel;
    }
    return "";
  }, [isGenerating, factsResult, planStatus, timeZone]);

  return {
    timeZone,
    inputError,
    activities,
    fixedCommitments,
    isGenerating,
    planStatus,
    modelUsed,
    factsResult,
    narrativeResult,
    generationError,
    availableRangeText,
    liveStatusMessage,
    addActivity,
    updateActivity,
    removeActivity,
    addCommitment,
    updateCommitment,
    removeCommitment,
    handleBuildPlan,
    scrollToForm,
  };
}
