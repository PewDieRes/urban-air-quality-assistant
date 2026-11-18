import { describe, it, expect } from "vitest";
import { formatSmokeExplanation, SmokeExplanationRequest } from "@/lib/smoke/explain";

describe("smoke job routes and explanation grounding", () => {
  it("renders trajectory path explanation without calculating or claiming smoke contribution or concentration", () => {
    const req: SmokeExplanationRequest = {
      fireId: "firms-punjab-1",
      sourceLocationName: "Sangrur, Punjab",
      destinationLocationName: "Delhi-NCR",
      startHeightsM: [100, 500, 1000],
      observedAt: "2024-11-03T08:00:00Z",
    };

    const explanation = formatSmokeExplanation(req);

    // 1. Describes possible air movement and uncertainty
    expect(explanation.text).toMatch(/possible atmospheric transport|air movement|where air may travel/i);
    expect(explanation.text).toMatch(/does not establish.*concentration/i);

    // 2. Contains no quantitative application-calculated smoke mass contribution
    expect(explanation.text).not.toMatch(/contributes \d+% of smog/i);
    expect(explanation.text).not.toMatch(/adds \d+ µg\/m³ of smoke/i);

    // 3. Offers alternatives to open agricultural residue burning
    expect(explanation.alternatives).toBeDefined();
    expect(explanation.alternatives.length).toBeGreaterThan(0);
    const altText = explanation.alternatives.join(" ");
    expect(altText).toMatch(/in-situ|mulch|happy seeder|briquette|bio-decomposer/i);
  });
});
