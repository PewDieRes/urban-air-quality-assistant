import React from "react";
import { Clock, Plus, Trash2 } from "lucide-react";
import { FixedCommitment } from "@/lib/plan/types";
import { TimeWindowField } from "./time-window-field";

interface CommitmentListProps {
  commitments: FixedCommitment[];
  timeZone: string;
  firstInputRef: React.RefObject<HTMLInputElement | null>;
  onAddCommitment: () => void;
  onUpdateCommitment: (commitmentId: string, patch: Partial<FixedCommitment>) => void;
  onRemoveCommitment: (commitmentId: string) => void;
}

/**
 * Editable list of immovable household commitments preserved during scheduling.
 */
export function CommitmentList({
  commitments,
  timeZone,
  firstInputRef,
  onAddCommitment,
  onUpdateCommitment,
  onRemoveCommitment,
}: CommitmentListProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-stone-700 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-stone-500" />
          Fixed Commitment (Stays fixed)
        </span>
        <button
          type="button"
          onClick={onAddCommitment}
          className="text-[11px] font-medium text-teal-700 hover:text-teal-900 transition flex items-center gap-1"
        >
          <Plus className="w-3 h-3" />
          Add commitment
        </button>
      </div>

      <div className="space-y-2">
        {commitments.map((commitment, index) => (
          <div
            key={commitment.id}
            className="bg-stone-50 border border-stone-200/80 rounded-xl p-3 flex flex-wrap items-center gap-3"
          >
            <div className="w-44 min-w-[140px]">
              <label htmlFor={`comm-title-${commitment.id}`} className="sr-only">
                Fixed Commitment Title
              </label>
              <input
                ref={index === 0 ? firstInputRef : undefined}
                id={`comm-title-${commitment.id}`}
                type="text"
                value={commitment.title}
                onChange={(event) =>
                  onUpdateCommitment(commitment.id, { title: event.target.value })
                }
                className="w-full bg-white border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-teal-700"
                placeholder="e.g. School pickup"
              />
            </div>

            <div className="flex-1 min-w-[240px]">
              <TimeWindowField
                label="Commitment"
                start={commitment.start}
                end={commitment.end}
                zone={timeZone}
                onChange={(nextStart, nextEnd) =>
                  onUpdateCommitment(commitment.id, { start: nextStart, end: nextEnd })
                }
              />
            </div>

            {commitments.length > 1 && (
              <button
                type="button"
                onClick={() => onRemoveCommitment(commitment.id)}
                aria-label={`Remove commitment ${commitment.title}`}
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
