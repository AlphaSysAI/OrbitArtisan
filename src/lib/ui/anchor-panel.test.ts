import { describe, expect, it } from "vitest";

import { computeAnchoredPanelRect, resolveAnchoredPanelSide } from "./anchor-panel";

describe("resolveAnchoredPanelSide", () => {
  it("ouvre au-dessus quand le trigger est en bas de l’écran", () => {
    expect(
      resolveAnchoredPanelSide({ top: 700, bottom: 756 }, 520, 800),
    ).toBe("above");
  });

  it("ouvre en dessous quand le trigger est trop haut", () => {
    expect(
      resolveAnchoredPanelSide({ top: 24, bottom: 80 }, 520, 800),
    ).toBe("below");
  });

  it("choisit le côté le plus spacieux si les deux sont contraints", () => {
    expect(
      resolveAnchoredPanelSide({ top: 120, bottom: 176 }, 520, 320),
    ).toBe("below");
  });
});

describe("computeAnchoredPanelRect", () => {
  it("positionne le panneau sous le trigger en mode auto haut", () => {
    const rect = computeAnchoredPanelRect({
      trigger: { top: 24, bottom: 80, left: 300, right: 380, width: 80, height: 56, x: 300, y: 24, toJSON: () => ({}) },
      preferredWidth: 420,
      preferredMaxHeight: 520,
      side: "auto",
      viewportHeight: 800,
      viewportWidth: 1280,
    });

    expect(rect.top).toBeGreaterThanOrEqual(80);
  });
});
