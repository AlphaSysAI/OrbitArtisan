import Link from "next/link";

import { cn } from "@/lib/utils";

/** Bascule Devis / Factures de l'entrée « Documents ». */
export function DocumentsTabs({ active }: { active: "quotes" | "invoices" }) {
  const tabs = [
    { key: "quotes", label: "Devis", href: "/app/quotes" },
    { key: "invoices", label: "Factures", href: "/app/invoices" },
  ] as const;
  return (
    <nav aria-label="Documents" className="flex w-full max-w-xs gap-1 rounded-lg bg-muted/50 p-1">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={active === t.key ? "page" : undefined}
          className={cn(
            "flex min-h-10 flex-1 items-center justify-center rounded-md text-sm font-medium",
            active === t.key ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
