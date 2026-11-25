import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LocationPicker } from "@/components/location/location-picker";
import { DEFAULT_PLACE, Place } from "@/lib/location/search";

function createDeferredResponse() {
  let resolvePromise!: (value: Response) => void;
  const promise = new Promise<Response>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolvePromise };
}

describe("LocationPicker autocomplete, stale-response guard, and keyboard navigation", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("ignores stale out-of-order search responses after a newer query resolves", async () => {
    const staleDelhi = createDeferredResponse();
    const fastTokyo = createDeferredResponse();

    const fetchMock = vi.fn().mockImplementation((input: string | URL) => {
      const url = String(input);
      if (url.includes("q=Del")) return staleDelhi.promise;
      if (url.includes("q=Tokyo")) return fastTokyo.promise;
      return Promise.resolve(new Response(JSON.stringify({ places: [] }), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const onSelectLocation = vi.fn();
    render(
      <LocationPicker
        selectedPlace={DEFAULT_PLACE}
        coordinates={{ lat: DEFAULT_PLACE.lat, lon: DEFAULT_PLACE.lon }}
        onSelectLocation={onSelectLocation}
      />
    );

    const combobox = screen.getByRole("combobox", { name: /search city or location/i });

    // Trigger debounced request for "Del"
    fireEvent.change(combobox, { target: { value: "Del" } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: 1000 });

    // Type newer query "Tokyo" while "Del" is still in flight
    fireEvent.change(combobox, { target: { value: "Tokyo" } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2), { timeout: 1000 });

    fastTokyo.resolvePromise(
      new Response(
        JSON.stringify({
          places: [
            {
              id: "tokyo-1",
              name: "Tokyo",
              region: "Tokyo",
              country: "Japan",
              lat: 35.6762,
              lon: 139.6503,
            } satisfies Place,
          ],
        }),
        { status: 200 }
      )
    );

    await waitFor(() => expect(screen.getByRole("option", { name: /Tokyo/i })).toBeInTheDocument());

    // Now resolve stale "Del" response — must not overwrite newer "Tokyo" results
    staleDelhi.resolvePromise(
      new Response(
        JSON.stringify({
          places: [
            {
              id: "delhi-stale",
              name: "Old Stale Delhi",
              region: "Delhi",
              country: "India",
              lat: 28.61,
              lon: 77.2,
            } satisfies Place,
          ],
        }),
        { status: 200 }
      )
    );

    await waitFor(() => {
      expect(screen.getByRole("option", { name: /Tokyo/i })).toBeInTheDocument();
      expect(screen.queryByText(/Old Stale Delhi/i)).not.toBeInTheDocument();
    });
  });

  it("supports ArrowDown, ArrowUp, Enter, and Escape combobox keyboard navigation", async () => {
    const places: Place[] = [
      { id: "city-1", name: "Osaka", region: "Osaka", country: "Japan", lat: 34.69, lon: 135.5 },
      { id: "city-2", name: "Oslo", region: "Oslo", country: "Norway", lat: 59.91, lon: 10.75 },
    ];

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ places }), { status: 200 }))
    );

    const onSelectLocation = vi.fn();
    render(
      <LocationPicker
        selectedPlace={DEFAULT_PLACE}
        coordinates={{ lat: DEFAULT_PLACE.lat, lon: DEFAULT_PLACE.lon }}
        onSelectLocation={onSelectLocation}
      />
    );

    const combobox = screen.getByRole("combobox", { name: /search city or location/i });
    fireEvent.change(combobox, { target: { value: "Os" } });

    const options = await screen.findAllByRole("option");
    expect(options).toHaveLength(2);
    expect(combobox).toHaveAttribute("aria-expanded", "true");

    // Navigate with ArrowDown / ArrowUp
    fireEvent.keyDown(combobox, { key: "ArrowDown" });
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(combobox.getAttribute("aria-activedescendant")).toBe(options[0].id);

    fireEvent.keyDown(combobox, { key: "ArrowDown" });
    expect(options[1]).toHaveAttribute("aria-selected", "true");

    // Escape dismisses listbox and clears active option
    fireEvent.keyDown(combobox, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(combobox).toHaveAttribute("aria-expanded", "false");

    // ArrowUp re-opens at the final option and Enter selects it
    fireEvent.keyDown(combobox, { key: "ArrowUp" });
    const reopenedOptions = screen.getAllByRole("option");
    expect(reopenedOptions[1]).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(combobox, { key: "Enter" });
    expect(onSelectLocation).toHaveBeenCalledWith(places[1], {
      lat: places[1].lat,
      lon: places[1].lon,
    });
  });
});
