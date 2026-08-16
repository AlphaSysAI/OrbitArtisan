/** Mode « appli » (plein écran) : PWA installée ou ajoutée à l’écran d’accueil. */
export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;

  const standaloneMedia = [
    "(display-mode: standalone)",
    "(display-mode: fullscreen)",
    "(display-mode: minimal-ui)",
    "(display-mode: window-controls-overlay)",
  ].some((query) => window.matchMedia(query).matches);

  const ios =
    "standalone" in window.navigator &&
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

  // Android TWA / certain lanceurs
  const androidReferrer = typeof document !== "undefined" && document.referrer.startsWith("android-app://");

  return standaloneMedia || ios || androidReferrer;
}

export function isLikelyMobileDevice(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const narrow = window.matchMedia("(max-width: 767px)").matches;
  const mobileUa = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
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
export const PWA_INSTALLED_KEY = "alphasys-pwa-installed";
export const PWA_DISMISS_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

export function wasPwaInstalled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(PWA_INSTALLED_KEY) === "1";
}

/** Marque l’app comme installée (évite de re-proposer l’ajout à l’écran d’accueil). */
export function rememberPwaInstalled(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PWA_INSTALLED_KEY, "1");
}

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

type InstalledRelatedApp = { platform?: string; id?: string; url?: string };

/** Chrome Android : détecte une PWA déjà installée même en navigation classique. */
export async function hasInstalledRelatedWebApp(): Promise<boolean> {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & {
    getInstalledRelatedApps?: () => Promise<InstalledRelatedApp[]>;
  };
  if (typeof nav.getInstalledRelatedApps !== "function") return false;

  try {
    const related = await nav.getInstalledRelatedApps();
    return related.some((app) => app.platform === "webapp");
  } catch {
    return false;
  }
}

/** Ne pas afficher la modale d’installation. */
export async function shouldSuppressInstallPrompt(): Promise<boolean> {
  if (isStandaloneDisplay()) return true;
  if (wasPwaInstalled()) return true;
  if (wasInstallPromptDismissedRecently()) return true;
  if (await hasInstalledRelatedWebApp()) return true;
  return false;
}
