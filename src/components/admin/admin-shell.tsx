"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Shield,
} from "lucide-react";

import { signOut } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "Vue d'ensemble", icon: LayoutDashboard, exact: true },
  { href: "/admin/tenants", label: "Artisans", icon: Building2 },
  { href: "/admin/logs", label: "Logs / Audit", icon: ClipboardList },
];

export function AdminShell({
  children,
  adminEmail,
}: {
  children: React.ReactNode;
  adminEmail?: string | null;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-svh bg-muted/30">
      <div className="mx-auto flex min-h-svh max-w-[1600px]">
        <aside className="hidden w-64 shrink-0 flex-col border-r border-border/70 bg-background/95 p-5 lg:flex">
          <div className="mb-8 flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-foreground text-background">
              <Shield className="size-5" />
            </span>
            <div className="leading-tight">
              <p className="font-display text-sm font-semibold tracking-tight">Soline Admin</p>
              <p className="text-xs text-muted-foreground">Super Admin</p>
            </div>
          </div>

          <nav className="flex flex-1 flex-col gap-1">
            {NAV.map((item) => {
              const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto space-y-3 border-t border-border/70 pt-4">
            {adminEmail ? (
              <p className="truncate text-xs text-muted-foreground" title={adminEmail}>
                {adminEmail}
              </p>
            ) : null}
            <Link
              href="/app"
              className="block text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Retour espace pro
            </Link>
            <form action={signOut}>
              <Button type="submit" variant="outline" size="sm" className="w-full gap-2">
                <LogOut className="size-4" />
                Déconnexion
              </Button>
            </form>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 px-4 py-3 backdrop-blur-xl lg:hidden">
            <div className="flex items-center justify-between gap-3">
              <p className="font-display text-sm font-semibold">Soline Admin</p>
              <div className="flex gap-2">
                {NAV.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "rounded-md px-2 py-1 text-xs font-medium",
                      pathname.startsWith(item.href) ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                    )}
                  >
                    {item.label.split(" ")[0]}
                  </Link>
                ))}
              </div>
            </div>
          </header>
          <main className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
