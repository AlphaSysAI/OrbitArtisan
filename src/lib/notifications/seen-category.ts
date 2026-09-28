import type { NotificationCategory } from "@/lib/notifications/types";

/**
 * Catégorie de badge « vu / pas vu » soldée par la visite d'une page.
 * `voice_intakes` n'en fait pas partie : le compteur ne baisse qu'après une
 * vraie validation / un rejet (point 12 de l'audit pré-pilote).
 */
export function seenCategoryForPath(pathname: string | null): NotificationCategory | null {
  if (!pathname) return null;
  if (pathname === "/app/quotes" || pathname.startsWith("/app/quotes/")) return "quotes_accepted";
  if (pathname === "/mes-devis" || pathname.startsWith("/mes-devis/")) return "quotes_received";
  if (pathname === "/compte/factures" || pathname.startsWith("/compte/factures/")) return "invoices_received";
  return null;
}
