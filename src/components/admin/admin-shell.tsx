"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Briefcase,
  Building2,
  ClipboardList,
  Handshake,
  LayoutDashboard,
  LogOut,
  Menu,
  Phone,
  Shield,
  X,
} from "lucide-react";

import { signOut } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "Accueil", icon: LayoutDashboard, match: (p: string) => p === "/admin" },
  { href: "/admin/tenants", label: "Artisans", icon: Building2, match: (p: string) => p.startsWith("/admin/tenants") },
  { href: "/admin/conciergerie", label: "Conciergerie", icon: Handshake, match: (p: string) => p.startsWith("/admin/conciergerie") },
  { href: "/admin/apporteurs", label: "Apporteurs", icon: Briefcase, match: (p: string) => p.startsWith("/admin/apporteurs") },
  { href: "/admin/telecom/pool", label: "Numéros Soline", icon: Phone, match: (p: string) => p.startsWith("/admin/telecom") },
  { href: "/admin/logs", label: "Journal", icon: ClipboardList, match: (p: string) => p.startsWith("/admin/logs") },
];

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => {
        const active = item.match(pathname);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function AccountBlock({ adminEmail }: { adminEmail?: string | null }) {
  return (
    <div className="space-y-3 border-t border-border/70 pt-4">
      {adminEmail ? (
        <p className="truncate text-xs text-muted-foreground" title={adminEmail}>
          {adminEmail}
        </p>
      ) : null}
      <Link
        href="/app"
        className="block text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        Retour à l&apos;espace pro
      </Link>
      <form action={signOut}>
        <Button type="submit" variant="outline" size="sm" className="w-full gap-2">
          <LogOut className="size-4" />
          Déconnexion
        </Button>
      </form>
    </div>
  );
}

export function AdminShell({ children, adminEmail }: { children: React.ReactNode; adminEmail?: string | null }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const current = NAV.find((item) => item.match(pathname));

  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <div className="min-h-svh bg-muted/30">
      <div className="mx-auto flex min-h-svh max-w-[1600px]">
        <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-r border-border/70 bg-background/95 p-4 lg:flex">
          <div className="mb-6 flex items-center gap-3 px-1">
            <span className="flex size-9 items-center justify-center rounded-xl bg-foreground text-background">
              <Shield className="size-4" />
            </span>
            <p className="font-display text-sm font-semibold tracking-tight">Soline Admin</p>
          </div>
          <NavLinks pathname={pathname} />
          <div className="mt-auto">
            <AccountBlock adminEmail={adminEmail} />
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border/70 bg-background/90 px-4 py-2.5 backdrop-blur-xl lg:hidden">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-foreground text-background">
                <Shield className="size-4" />
              </span>
              <p className="truncate text-sm font-semibold">{current?.label ?? "Soline Admin"}</p>
            </div>
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setMenuOpen(true)} aria-expanded={menuOpen}>
              <Menu className="size-4" />
              Menu
            </Button>
          </header>

          {menuOpen ? (
            <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu admin">
              <button type="button" aria-label="Fermer le menu" className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
              <div className="absolute inset-y-0 right-0 flex w-[min(20rem,85vw)] flex-col bg-background p-4 shadow-2xl">
                <div className="mb-4 flex items-center justify-between">
                  <p className="font-display text-base font-semibold">Soline Admin</p>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Fermer" onClick={() => setMenuOpen(false)}>
                    <X className="size-4" />
                  </Button>
                </div>
                <NavLinks pathname={pathname} onNavigate={() => setMenuOpen(false)} />
                <div className="mt-auto">
                  <AccountBlock adminEmail={adminEmail} />
                </div>
              </div>
            </div>
          ) : null}

          <main className="px-4 py-5 sm:px-6 lg:px-8 lg:py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
