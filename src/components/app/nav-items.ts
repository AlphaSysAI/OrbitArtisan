import {
  BookOpen,
  CalendarClock,
  FileText,
  Home,
  MessageSquare,
  Receipt,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

export type AppNavItem = {
  href: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  exact: boolean;
};

/** Navigation principale (header desktop + menu burger mobile). */
export const APP_NAV_ITEMS: AppNavItem[] = [
  { href: "/app", label: "Accueil", shortLabel: "Accueil", icon: Home, exact: true },
  { href: "/app/rdv", label: "Mes RDV", shortLabel: "RDV", icon: CalendarClock, exact: false },
  { href: "/app/contacts", label: "Contacts", shortLabel: "Clients", icon: Users, exact: false },
  { href: "/app/messages", label: "Messages", shortLabel: "Msgs", icon: MessageSquare, exact: false },
  { href: "/app/quotes", label: "Devis", shortLabel: "Devis", icon: FileText, exact: false },
  { href: "/app/ouvrages", label: "Ouvrages", shortLabel: "Ouvrages", icon: BookOpen, exact: false },
  { href: "/app/invoices", label: "Factures", shortLabel: "Factures", icon: Receipt, exact: false },
  { href: "/app/reglages", label: "Réglages", shortLabel: "Réglages", icon: Settings, exact: false },
];

export function isNavItemActive(pathname: string, item: AppNavItem) {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}
