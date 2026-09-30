import {
  BookOpen,
  CalendarClock,
  FileText,
  Hammer,
  Inbox,
  MessageSquare,
  Phone,
  Settings,
  Truck,
  Users,
  ClipboardList,
  type LucideIcon,
} from "lucide-react";

import type { NotificationBadgeKey } from "@/lib/notifications/types";
import { SOLINE_CALLS_HUB_PATH } from "@/lib/voice/soline-voice-access";

export type AppNavItem = {
  href: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  exact: boolean;
  badgeKey?: NotificationBadgeKey;
  /** Préfixes de chemin qui activent aussi l'entrée (ex. Documents = devis + factures). */
  activePrefixes?: string[];
};

/**
 * Navigation recentrée (fiche client unifiée) : 4 entrées pour le quotidien.
 * « À traiter » = tout ce qui attend une action ; « Clients » = une fiche par
 * client avec tout son historique ; « Documents » = devis + factures ; « Agenda ».
 */
export const APP_NAV_PRIMARY: AppNavItem[] = [
  { href: "/app", label: "À traiter", shortLabel: "À traiter", icon: Inbox, exact: true, badgeKey: "inbox" },
  {
    href: "/app/clients",
    label: "Clients",
    shortLabel: "Clients",
    icon: Users,
    exact: false,
    activePrefixes: ["/app/clients", "/app/contacts"],
  },
  {
    href: "/app/quotes",
    label: "Documents",
    shortLabel: "Docs",
    icon: FileText,
    exact: false,
    badgeKey: "quotes_accepted",
    activePrefixes: ["/app/quotes", "/app/invoices"],
  },
  { href: "/app/rdv", label: "Agenda", shortLabel: "Agenda", icon: CalendarClock, exact: false },
];

/** Vues détaillées et outils (menu « Plus »). */
export const APP_NAV_MORE: AppNavItem[] = [
  {
    href: "/app/messages",
    label: "Messages",
    shortLabel: "Msgs",
    icon: MessageSquare,
    exact: false,
    badgeKey: "messages",
  },
  {
    href: SOLINE_CALLS_HUB_PATH,
    label: "Appels Soline",
    shortLabel: "Appels",
    icon: Phone,
    exact: false,
    badgeKey: "voice_intakes",
  },
  { href: "/app/chantiers", label: "Chantiers", shortLabel: "Chantiers", icon: Hammer, exact: false },
  { href: "/app/ouvrages", label: "Ouvrages", shortLabel: "Ouvrages", icon: BookOpen, exact: false },
  { href: "/app/interventions", label: "Interventions", shortLabel: "BI", icon: ClipboardList, exact: false },
  { href: "/app/fournisseurs", label: "Fournisseurs", shortLabel: "Fourn.", icon: Truck, exact: false },
  { href: "/app/reglages", label: "Réglages", shortLabel: "Réglages", icon: Settings, exact: false },
];

/** Navigation complète (menu mobile tuiles). */
export const APP_NAV_ITEMS: AppNavItem[] = [...APP_NAV_PRIMARY, ...APP_NAV_MORE];

/** Barre du bas mobile : 2 liens à gauche + 2 à droite du bouton menu central. */
export const APP_NAV_BOTTOM: [
  AppNavItem,
  AppNavItem,
  AppNavItem,
  AppNavItem,
] = [
  APP_NAV_PRIMARY[0]!, // À traiter
  APP_NAV_PRIMARY[1]!, // Clients
  APP_NAV_PRIMARY[2]!, // Documents
  APP_NAV_PRIMARY[3]!, // Agenda
];

export function isNavItemActive(pathname: string, item: AppNavItem) {
  if (item.href === SOLINE_CALLS_HUB_PATH) {
    return pathname.startsWith("/app/appels") || pathname.startsWith(SOLINE_CALLS_HUB_PATH);
  }
  if (item.activePrefixes) return item.activePrefixes.some((p) => pathname.startsWith(p));
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}

export function isNavMoreActive(pathname: string) {
  return APP_NAV_MORE.some((item) => isNavItemActive(pathname, item));
}
