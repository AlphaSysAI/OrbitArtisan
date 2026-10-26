import Link from "next/link";

import { cn } from "@/lib/utils";

export type AdminTab = { href: string; label: string; count?: number | null; active: boolean };

/** Onglets en liens (filtres, sous-sections) : défilement horizontal sur mobile. */
export function AdminTabs({ tabs, className }: { tabs: AdminTab[]; className?: string }) {
  return (
    <nav className={cn("-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0", className)}>
      <div className="flex w-max gap-1 rounded-xl bg-muted/60 p-1">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={t.active ? "page" : undefined}
            className={cn(
              "flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors",
              t.active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.count != null ? (
              <span className={cn("rounded-full px-1.5 text-xs tabular-nums", t.active ? "bg-muted" : "bg-background/70")}>{t.count}</span>
            ) : null}
          </Link>
        ))}
      </div>
    </nav>
  );
}
