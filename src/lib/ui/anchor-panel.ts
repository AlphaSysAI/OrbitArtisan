/** Positionne un panneau flottant dans le viewport, ancré à un trigger. */

export type AnchorSide = "below" | "above";

export type AnchorRect = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

const MARGIN = 8;

/** Hauteur minimale utile avant de basculer l’ancrage de l’autre côté du trigger. */
const MIN_USEFUL_PANEL_HEIGHT = 280;

export function resolveAnchoredPanelSide(
  trigger: Pick<DOMRect, "top" | "bottom">,
  preferredMaxHeight: number,
  viewportHeight: number,
): AnchorSide {
  const spaceAbove = trigger.top - MARGIN;
  const spaceBelow = viewportHeight - trigger.bottom - MARGIN;
  const minUseful = Math.min(preferredMaxHeight, MIN_USEFUL_PANEL_HEIGHT);

  if (spaceAbove >= minUseful) return "above";
  if (spaceBelow >= minUseful) return "below";
  return spaceBelow > spaceAbove ? "below" : "above";
}

export function computeAnchoredPanelRect(params: {
  trigger: DOMRect;
  /** Largeur souhaitée du panneau */
  preferredWidth: number;
  /** Hauteur max souhaitée */
  preferredMaxHeight: number;
  side: AnchorSide | "auto";
  /** Alignement horizontal du panneau par rapport au trigger */
  align?: "start" | "end";
  viewportHeight?: number;
  viewportWidth?: number;
}): AnchorRect {
  const {
    trigger,
    preferredWidth,
    preferredMaxHeight,
    side,
    align = "end",
    viewportHeight = typeof window !== "undefined" ? window.innerHeight : 800,
    viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1280,
  } = params;
  const resolvedSide =
    side === "auto"
      ? resolveAnchoredPanelSide(trigger, preferredMaxHeight, viewportHeight)
      : side;
  const vw = viewportWidth;
  const vh = viewportHeight;

  const width = Math.min(preferredWidth, vw - MARGIN * 2);

  let left = align === "end" ? trigger.right - width : trigger.left;
  left = Math.min(Math.max(MARGIN, left), vw - width - MARGIN);

  if (resolvedSide === "below") {
    const top = trigger.bottom + MARGIN;
    const maxHeight = Math.min(preferredMaxHeight, vh - top - MARGIN);
    return { top, left, width, maxHeight: Math.max(160, maxHeight) };
  }

  // above
  const maxHeight = Math.min(preferredMaxHeight, trigger.top - MARGIN * 2);
  const heightBudget = Math.max(160, maxHeight);
  const top = Math.max(MARGIN, trigger.top - MARGIN - heightBudget);
  return {
    top,
    left,
    width,
    maxHeight: Math.min(heightBudget, vh - top - MARGIN),
  };
}
