export interface SmokeExplanationRequest {
  fireId: string;
  sourceLocationName?: string;
  destinationLocationName?: string;
  startHeightsM: number[];
  observedAt: string;
}

export interface SmokeExplanationResult {
  text: string;
  uncertaintyNotes: string;
  alternatives: string[];
}

export function formatSmokeExplanation(req: SmokeExplanationRequest): SmokeExplanationResult {
  const heightsStr = req.startHeightsM.map((h) => `${h}m`).join(", ");
  const dateStr = new Date(req.observedAt).toLocaleDateString([], {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const text = `Possible atmospheric transport paths from detected fire (${req.fireId}) on ${dateStr} across starting levels (${heightsStr} AGL). The path estimates where air may travel based on synoptic weather fields. It does not establish smoke concentrations or source contribution. Total regional air quality is measured separately.`;

  const uncertaintyNotes =
    "Wind trajectories represent parcel movement in gridded meteorological models. Local turbulent dispersion, chemical plume transformation, and precipitation scavenging introduce variance in ground-level air impacts.";

  const alternatives = [
    "In-situ straw mulching and zero-till sowing (Happy Seeder / Smart Seeder) to return organic matter to the soil without burning.",
    "Ex-situ biomass collection for power plants, bio-pellets, and industrial boilers.",
    "Application of microbial bio-decomposer sprays to accelerate crop stubble decomposition directly in the field.",
  ];

  return {
    text,
    uncertaintyNotes,
    alternatives,
  };
}
