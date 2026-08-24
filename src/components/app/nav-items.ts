import {
  BookOpen,
  CalendarClock,
  FileText,
  Hammer,
  Home,
  MessageSquare,
  Phone,
  Receipt,
  Settings,
  Truck,
  Users,
  ClipboardList,
  type LucideIcon,
} from "lucide-react";

export type AppNavItem = {
  href: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  exact: boolean;
};

/** Liens visibles directement dans le header desktop (5 max). */
export const APP_NAV_PRIMARY: AppNavItem[] = [
  { href: "/app", label: "Accueil", shortLabel: "Accueil", icon: Home, exact: true },
  { href: "/app/quotes", label: "Devis", shortLabel: "Devis", icon: FileText, exact: false },
  { href: "/app/invoices", label: "Factures", shortLabel: "Factures", icon: Receipt, exact: false },
  { href: "/app/contacts", label: "Contacts", shortLabel: "Clients", icon: Users, exact: false },
  { href: "/app/messages", label: "Messages", shortLabel: "Msgs", icon: MessageSquare, exact: false },
];

/** Liens regroupés dans le menu « Plus » (header desktop). */
export const APP_NAV_MORE: AppNavItem[] = [
  { href: "/app/rdv", label: "Mes RDV", shortLabel: "RDV", icon: CalendarClock, exact: false },
  { href: "/app/appels", label: "Appels Soline", shortLabel: "Appels", icon: Phone, exact: false },
  { href: "/app/ouvrages", label: "Ouvrages", shortLabel: "Ouvrages", icon: BookOpen, exact: false },
  { href: "/app/chantiers", label: "Chantiers", shortLabel: "Chantiers", icon: Hammer, exact: false },
  { href: "/app/interventions", label: "Interventions", shortLabel: "BI", icon: ClipboardList, exact: false },
  { href: "/app/fournisseurs", label: "Fournisseurs", shortLabel: "Fourn.", icon: Truck, exact: false },
  { href: "/app/reglages", label: "Réglages", shortLabel: "Réglages", icon: Settings, exact: false },
];

/** Navigation complète (menu mobile). */
export const APP_NAV_ITEMS: AppNavItem[] = [...APP_NAV_PRIMARY, ...APP_NAV_MORE];

export function isNavItemActive(pathname: string, item: AppNavItem) {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}

export function isNavMoreActive(pathname: string) {
  return APP_NAV_MORE.some((item) => isNavItemActive(pathname, item));
}
