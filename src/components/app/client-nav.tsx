"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, Home, MapPin, MessageSquare, Receipt, Settings, Users } from "lucide-react";

import { NavBadge } from "@/components/notifications/nav-badge";
import { useNotifications } from "@/components/notifications/notification-provider";
import type { NotificationBadgeKey } from "@/lib/notifications/types";
import { cn } from "@/lib/utils";

const items: {
  href: string;
  label: string;
  icon: typeof Home;
  exact: boolean;
  badgeKey?: NotificationBadgeKey;
}[] = [
  { href: "/compte", label: "Accueil", icon: Home, exact: true },
  { href: "/compte/recherche", label: "Trouver un artisan", icon: MapPin, exact: false },
  { href: "/compte/contacts", label: "Mes artisans", icon: Users, exact: false },
  {
    href: "/mes-devis",
    label: "Mes devis",
    icon: FileText,
    exact: false,
    badgeKey: "quotes_received",
  },
  {
    href: "/compte/factures",
    label: "Factures",
    icon: Receipt,
    exact: false,
    badgeKey: "invoices_received",
  },
  { href: "/compte/messages", label: "Messages", icon: MessageSquare, exact: false, badgeKey: "messages" },
  { href: "/compte/reglages", label: "Réglages", icon: Settings, exact: false },
];

export function ClientNav() {
  const pathname = usePathname();
  const { badgeCount } = useNotifications();

  return (
    <nav
      className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0"
      aria-label="Navigation client"
    >
      {items.map(({ href, label, icon: Icon, exact, badgeKey }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        const count = badgeKey ? badgeCount(badgeKey) : 0;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition-colors lg:gap-3 lg:px-4 lg:py-3",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4 shrink-0 opacity-90 lg:h-5 lg:w-5" />
            <span className="flex flex-1 items-center gap-2">
              {label}
              <NavBadge count={count} variant="inline" className="ml-auto" />
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
