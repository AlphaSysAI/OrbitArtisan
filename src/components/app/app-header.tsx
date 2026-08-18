"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, Shield, X } from "lucide-react";
import { createPortal } from "react-dom";

import { APP_NAV_ITEMS, isNavItemActive } from "@/components/app/nav-items";
import { InviteSomeoneDialog } from "@/components/invitations/invite-someone-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { signOut } from "@/app/login/actions";
import { computeAnchoredPanelRect, type AnchorRect } from "@/lib/ui/anchor-panel";
import { cn } from "@/lib/utils";

export function AppHeader({ isPlatformAdmin = false }: { isPlatformAdmin?: boolean }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [panelRect, setPanelRect] = useState<AnchorRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useLayoutEffect(() => {
    if (!menuOpen) {
      setPanelRect(null);
      return;
    }

    function update() {
      const trigger = triggerRef.current?.getBoundingClientRect();
      if (!trigger) return;
      setPanelRect(
        computeAnchoredPanelRect({
          trigger,
          preferredWidth: 320,
          preferredMaxHeight: Math.min(window.innerHeight * 0.7, 448),
          side: "below",
          align: "end",
        }),
      );
    }

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;

    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 lg:gap-4 lg:px-8">
        <Link href="/app" className="group flex min-w-0 shrink-0 items-center gap-3">
          <div className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-primary text-primary-foreground shadow-sm transition-transform group-hover:scale-[1.03] sm:size-11">
            <span className="font-display text-lg font-semibold tracking-tight">O</span>
            <span className="absolute inset-x-0 bottom-0 h-1 bg-brand" aria-hidden />
          </div>
          <div className="min-w-0 leading-tight">
            <p className="font-display truncate text-base font-semibold tracking-tight sm:text-lg">
              Soline
            </p>
            <p className="hidden text-xs text-muted-foreground sm:block">Espace pro</p>
          </div>
        </Link>

        <nav
          className="ml-1 hidden min-w-0 flex-1 items-center gap-0.5 lg:flex xl:justify-center xl:gap-1"
          aria-label="Navigation principale"
        >
          {APP_NAV_ITEMS.map((item) => {
            const active = isNavItemActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-xl px-2.5 py-2 text-sm font-semibold transition-colors xl:px-3",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          {isPlatformAdmin ? (
            <Link
              href="/admin"
              className={cn(
                "hidden items-center gap-1.5 rounded-xl px-2.5 py-2 text-sm font-semibold transition-colors sm:inline-flex",
                pathname.startsWith("/admin")
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Shield className="size-4" />
              <span className="hidden xl:inline">Admin</span>
            </Link>
          ) : null}
          <div className="hidden sm:block">
            <InviteSomeoneDialog
              contextLabel="Je"
              canLinkClientToArtisan
              size="default"
              className="min-h-10 px-3"
            />
          </div>
          <ThemeToggle />
          <form action={signOut} className="hidden sm:block">
            <Button
              variant="outline"
              size="default"
              type="submit"
              className="min-h-10 gap-2 text-muted-foreground"
            >
              <LogOut className="size-4" />
              <span className="hidden xl:inline">Quitter</span>
            </Button>
          </form>

          <Button
            ref={triggerRef}
            type="button"
            variant="outline"
            size="icon"
            className="lg:hidden"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-controls="app-mobile-menu"
            aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}
          >
            {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>
      </div>

      {mounted && menuOpen && panelRect
        ? createPortal(
            <div
              ref={panelRef}
              id="app-mobile-menu"
              role="menu"
              aria-label="Menu de navigation"
              className="fixed z-[60] overflow-hidden rounded-2xl border border-border/80 bg-background p-2 shadow-[0_16px_48px_rgb(0_0_0/0.16)]"
              style={{
                top: panelRect.top,
                left: panelRect.left,
                width: panelRect.width,
                maxHeight: panelRect.maxHeight,
              }}
            >
              <nav
                className="flex flex-col gap-0.5 overflow-y-auto"
                style={{ maxHeight: panelRect.maxHeight - 96 }}
              >
                {APP_NAV_ITEMS.map((item) => {
                  const active = isNavItemActive(pathname, item);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      role="menuitem"
                      className={cn(
                        "flex min-h-12 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "text-foreground hover:bg-muted",
                      )}
                    >
                      <Icon className="size-5 shrink-0 opacity-90" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>

              <div className="mt-2 space-y-2 border-t border-border/70 pt-2">
                {isPlatformAdmin ? (
                  <Link
                    href="/admin"
                    role="menuitem"
                    className={cn(
                      "flex min-h-12 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                      pathname.startsWith("/admin")
                        ? "bg-foreground text-background"
                        : "text-foreground hover:bg-muted",
                    )}
                  >
                    <Shield className="size-5 shrink-0 opacity-90" />
                    Administration
                  </Link>
                ) : null}
                <InviteSomeoneDialog
                  contextLabel="Je"
                  canLinkClientToArtisan
                  size="default"
                  className="w-full justify-center"
                />
                <form action={signOut}>
                  <Button
                    variant="outline"
                    type="submit"
                    className="w-full gap-2 text-muted-foreground"
                  >
                    <LogOut className="size-4" />
                    Quitter
                  </Button>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}
    </header>
  );
}
