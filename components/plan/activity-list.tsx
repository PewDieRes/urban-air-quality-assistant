import React from "react";
import { Calendar, Plus, Trash2 } from "lucide-react";
import { FlexibleActivity } from "@/lib/plan/types";
import { TimeWindowField } from "./time-window-field";

interface ActivityListProps {
  activities: FlexibleActivity[];
  timeZone: string;
  onAddActivity: () => void;
  onUpdateActivity: (activityId: string, patch: Partial<FlexibleActivity>) => void;
  onRemoveActivity: (activityId: string) => void;
}

/**
 * Editable list of flexible activities eligible for lower-pollution rescheduling.
 */
export function ActivityList({
  activities,
  timeZone,
  onAddActivity,
  onUpdateActivity,
  onRemoveActivity,
}: ActivityListProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-stone-700 flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-teal-700" />
          Flexible Activity (Can move to lower pollution)
        </span>
        <button
          type="button"
          onClick={onAddActivity}
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
                onChange={(event) => onUpdateActivity(activity.id, { title: event.target.value })}
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
                onChange={(event) =>
                  onUpdateActivity(activity.id, {
                    durationMinutes: parseInt(event.target.value, 10),
                  })
                }
                className="w-full bg-white border border-stone-200 rounded-lg px-2 py-1.5 text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-teal-700"
              >
                <option value={30}>30 min</option>
                <option value={60}>1 hour</option>
                <option value={90}>1.5 hours</option>
                <option value={120}>2 hours</option>
              </select>
            </div>

            <div className="flex-1 min-w-[240px]">
              <TimeWindowField
                label="Activity"
                start={activity.windowStart}
                end={activity.windowEnd}
                zone={timeZone}
                onChange={(nextStart, nextEnd) =>
                  onUpdateActivity(activity.id, { windowStart: nextStart, windowEnd: nextEnd })
                }
              />
            </div>

            {activities.length > 1 && (
              <button
                type="button"
                onClick={() => onRemoveActivity(activity.id)}
                aria-label={`Remove activity ${activity.title}`}
                className="p-1 text-stone-600 hover:text-rose-600 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
