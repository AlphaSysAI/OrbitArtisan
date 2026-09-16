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
    <nav className="flex flex-col gap-1" aria-label="Navigation client">
      {items.map(({ href, label, icon: Icon, exact, badgeKey }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        const count = badgeKey ? badgeCount(badgeKey) : 0;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <span className="relative shrink-0 overflow-visible py-0.5 pr-1">
              <Icon className="h-5 w-5 opacity-90" />
              <NavBadge count={count} />
            </span>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
