import { describe, expect, it } from "vitest";

import type { LeadQualification } from "@/lib/ai/qualify-lead-schema";
import { buildFullLeadEstimate } from "@/lib/leads/pricing";

const baseQualification: LeadQualification = {
  need_summary: "Fuite évier",
  job_type: "Plomberie",
  urgency: "urgent",
  technical_elements: ["siphon"],
  estimated_hours_min: 2,
  estimated_hours_max: 4,
  complexity: "simple",
  material_cost_share: 0.2,
  confidence: "bonne",
  missing_info: [],
};

describe("buildFullLeadEstimate", () => {
  it("additionne main-d'œuvre et fournitures chiffrées", () => {
    const estimate = buildFullLeadEstimate(
      baseQualification,
      { hourlyRateEur: 50, source: "reference", sampleSize: 0 },
      { min: 30, max: 80, summary: "Siphon et joints", webUsed: true },
    );
    expect(estimate.min).toBeGreaterThanOrEqual(130);
    expect(estimate.max).toBeGreaterThan(estimate.min);
    expect(estimate.basis).toContain("fournitures");
    expect(estimate.basis).toContain("recoupés en ligne");
  });

  it("retombe sur buildEstimate sans poste matériaux", () => {
    const estimate = buildFullLeadEstimate(
      baseQualification,
      { hourlyRateEur: 50, source: "reference", sampleSize: 0 },
      null,
    );
    expect(estimate.basis).toContain("50 €/h");
  });
});
