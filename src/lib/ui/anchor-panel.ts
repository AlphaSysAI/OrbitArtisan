/** Positionne un panneau flottant dans le viewport, ancré à un trigger. */

export type AnchorSide = "below" | "above";

export type AnchorRect = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

const MARGIN = 8;

export function computeAnchoredPanelRect(params: {
  trigger: DOMRect;
  /** Largeur souhaitée du panneau */
  preferredWidth: number;
  /** Hauteur max souhaitée */
  preferredMaxHeight: number;
  side: AnchorSide;
  /** Alignement horizontal du panneau par rapport au trigger */
  align?: "start" | "end";
}): AnchorRect {
  const { trigger, preferredWidth, preferredMaxHeight, side, align = "end" } = params;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const width = Math.min(preferredWidth, vw - MARGIN * 2);

  let left = align === "end" ? trigger.right - width : trigger.left;
  left = Math.min(Math.max(MARGIN, left), vw - width - MARGIN);

  if (side === "below") {
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
