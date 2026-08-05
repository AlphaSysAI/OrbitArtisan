/** Mode « appli » (plein écran) : PWA installée ou ajoutée à l’écran d’accueil. */
export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  const byMedia =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches;
  const ios =
    "standalone" in window.navigator &&
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true;
  return byMedia || ios;
}

export function isLikelyMobileDevice(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const narrow = window.matchMedia("(max-width: 767px)").matches;
  const mobileUa = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    ua,
  );
  return (coarse && narrow) || mobileUa;
}

/** iPad / iPhone / iPod (y compris iPad « desktop » sous iPadOS). */
export function isIos(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function isAndroid(): boolean {
  if (typeof window === "undefined") return false;
  return /Android/i.test(window.navigator.userAgent);
}

export const PWA_INSTALL_DISMISS_KEY = "alphasys-pwa-install-dismissed-at";
export const PWA_DISMISS_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

export function wasInstallPromptDismissedRecently(): boolean {
  if (typeof window === "undefined") return true;
  const raw = window.localStorage.getItem(PWA_INSTALL_DISMISS_KEY);
  if (!raw) return false;
  const t = Number.parseInt(raw, 10);
  if (Number.isNaN(t)) return false;
  return Date.now() - t < PWA_DISMISS_COOLDOWN_MS;
}

export function rememberInstallPromptDismissed(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PWA_INSTALL_DISMISS_KEY, String(Date.now()));
}
