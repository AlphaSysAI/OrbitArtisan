import { describe, expect, it } from "vitest";

import type { LeadQualification } from "@/lib/ai/qualify-lead-schema";
import {
  applyStructuralShellEstimateFloor,
  enforceQualificationScale,
  extractSurfaceM2,
  isStructuralShellProject,
  surfaceShellEstimate,
} from "@/lib/leads/lead-project-scale";

const desc =
  "Construction maison neuve 125m2 au plancher, sans étage, plancher murs porteurs et toiture.";

describe("extractSurfaceM2", () => {
  it("lit 125 m²", () => {
    expect(extractSurfaceM2(desc)).toBe(125);
  });
});

describe("isStructuralShellProject", () => {
  it("détecte un gros œuvre avec surface", () => {
    expect(isStructuralShellProject(desc)).toBe(true);
  });
});

describe("enforceQualificationScale", () => {
  it("rehausse des heures dérisoires pour une maison", () => {
    const q: LeadQualification = {
      need_summary: "Maison",
      job_type: "Gros œuvre",
      urgency: "flexible",
      technical_elements: [],
      estimated_hours_min: 40,
      estimated_hours_max: 80,
      complexity: "moyenne",
      material_cost_share: 0.3,
      confidence: "bonne",
      missing_info: [],
    };
    const out = enforceQualificationScale(q, desc);
    expect(out.estimated_hours_min).toBeGreaterThanOrEqual(437);
    expect(out.estimated_hours_max).toBeGreaterThanOrEqual(1125);
    expect(out.material_cost_share).toBeGreaterThanOrEqual(0.55);
  });
});

describe("surfaceShellEstimate", () => {
  it("produit une fourchette crédible pour 125 m²", () => {
    const est = surfaceShellEstimate({ description: desc, mediaCount: 0 });
    expect(est).not.toBeNull();
    expect(est!.min).toBeGreaterThanOrEqual(40000);
    expect(est!.max).toBeGreaterThanOrEqual(80000);
  });
});

describe("applyStructuralShellEstimateFloor", () => {
  it("corrige une fourchette trop basse", () => {
    const fixed = applyStructuralShellEstimateFloor(
      { min: 12000, max: 25000, basis: "test" },
      desc,
    );
    expect(fixed.min).toBeGreaterThanOrEqual(40000);
    expect(fixed.max).toBeGreaterThan(fixed.min);
  });
});
