const STORAGE_KEY = "soline-assistant-position";

export type AssistantPosition = { left: number; top: number };

export function loadAssistantPosition(): AssistantPosition | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AssistantPosition;
    if (typeof parsed.left === "number" && typeof parsed.top === "number") return parsed;
  } catch {
    // ignore
  }
  return null;
}

export function saveAssistantPosition(pos: AssistantPosition): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
  } catch {
    // ignore
  }
}

/** Marges pour garder le bouton dans la zone utile (barre mobile incluse). */
export function getAssistantViewportInsets() {
  const isMobile = window.innerWidth < 1024;
  return {
    top: 8,
    left: 8,
    right: 8,
    bottom: isMobile ? 76 + 8 : 32,
  };
}

export function clampAssistantPosition(
  pos: AssistantPosition,
  size: { width: number; height: number },
): AssistantPosition {
  const insets = getAssistantViewportInsets();
  const maxLeft = window.innerWidth - size.width - insets.right;
  const maxTop = window.innerHeight - size.height - insets.bottom;
  return {
    left: Math.min(Math.max(insets.left, pos.left), Math.max(insets.left, maxLeft)),
    top: Math.min(Math.max(insets.top, pos.top), Math.max(insets.top, maxTop)),
  };
}
