import React from "react";

interface TimeWindowFieldProps {
  label: string;
  start: string;
  end: string;
  zone: string;
  onChange: (nextStart: string, nextEnd: string) => void;
}

/**
 * Accessible datetime-local window field pair sharing city timezone context.
 */
export function TimeWindowField({
  label,
  start,
  end,
  zone,
  onChange,
}: TimeWindowFieldProps) {
  return (
    <fieldset className="flex flex-wrap items-center gap-2 text-xs text-stone-700">
      <legend className="sr-only">
        {label} times · {zone}
      </legend>
      {(["start", "end"] as const).map((edge) => (
        <label key={edge} className="flex items-center gap-1 text-[11px]">
          <span className="text-stone-500 font-medium capitalize">
            {label} {edge}
          </span>
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
