"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, Home, MessageSquare, Receipt } from "lucide-react";

import { cn } from "@/lib/utils";

const items = [
  { href: "/compte", label: "Accueil", icon: Home, exact: true as boolean },
  { href: "/mes-devis", label: "Mes devis", icon: FileText, exact: false as boolean },
  { href: "/compte/factures", label: "Factures", icon: Receipt, exact: false as boolean },
  { href: "/compte/messages", label: "Messages", icon: MessageSquare, exact: false as boolean },
];

export function ClientNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1" aria-label="Navigation client">
      {items.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
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
            <Icon className="h-5 w-5 shrink-0 opacity-90" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
