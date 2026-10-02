import { describe, expect, it } from "vitest";

import {
  estimateConcreteVolumeM3,
  estimateHouseWallDimensions,
  estimateRoofAreaFromFootprint,
  estimateRoomWallArea,
} from "./geometry-engine";

describe("geometry-engine", () => {
  it.each([
    [100, 43.2, 108, 19.4, 88.6],
    [125, 48.3, 120.8, 21.7, 99.1],
    [130, 49.3, 123.3, 22.2, 101.1],
  ])("maison %d m² au sol → périmètre %d ml, murs nets %d m²", (sol, perim, gross, openings, net) => {
    expect(estimateHouseWallDimensions(sol)).toEqual({
      perimeterLinearMeters: perim,
      grossWallAreaM2: gross,
      openingsAreaM2: openings,
      netWallAreaM2: net,
    });
  });

  it("reste dans l'ordre de grandeur terrain (régression : 114 ml / 228 m² pour 130 m²)", () => {
    const d = estimateHouseWallDimensions(130);
    expect(d.perimeterLinearMeters).toBeGreaterThan(45);
    expect(d.perimeterLinearMeters).toBeLessThan(55);
    expect(d.netWallAreaM2).toBeGreaterThan(90);
    expect(d.netWallAreaM2).toBeLessThan(110);
  });

  it("toiture, murs de pièce, béton", () => {
    expect(estimateRoofAreaFromFootprint(130)).toBe(154.3);
    expect(estimateRoofAreaFromFootprint(100, 45)).toBe(122.8);
    expect(estimateRoomWallArea(12)).toBe(32.7);
    expect(estimateConcreteVolumeM3(130, 0.12)).toBe(16.38);
    expect(estimateHouseWallDimensions(0).netWallAreaM2).toBe(0);
  });
});
