"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, LogOut, Menu, Shield, X } from "lucide-react";
import { createPortal } from "react-dom";

import {
  APP_NAV_ITEMS,
  APP_NAV_MORE,
  APP_NAV_PRIMARY,
  isNavItemActive,
  isNavMoreActive,
} from "@/components/app/nav-items";
import { InviteSomeoneDialog } from "@/components/invitations/invite-someone-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/app/login/actions";
import { computeAnchoredPanelRect, type AnchorRect } from "@/lib/ui/anchor-panel";
import { cn } from "@/lib/utils";

function NavLink({
  item,
  active,
  compact,
}: {
  item: (typeof APP_NAV_PRIMARY)[number];
  active: boolean;
  compact?: boolean;
}) {
  return (
    <Link
      href={item.href}
      className={cn(
        "shrink-0 rounded-xl px-2 py-2 text-sm font-semibold transition-colors lg:px-2.5 xl:px-3",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <span className="xl:hidden">{compact ? item.shortLabel : item.label}</span>
      <span className="hidden xl:inline">{item.label}</span>
    </Link>
  );
}

export function AppHeader({ isPlatformAdmin = false }: { isPlatformAdmin?: boolean }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [panelRect, setPanelRect] = useState<AnchorRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const moreActive = isNavMoreActive(pathname);

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
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-3 sm:gap-3 sm:px-6 lg:px-8">
        <Link href="/app" className="group flex shrink-0 items-center gap-2.5 sm:gap-3">
          <div className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-primary text-primary-foreground shadow-sm transition-transform group-hover:scale-[1.03] sm:size-10">
            <span className="font-display text-base font-semibold tracking-tight sm:text-lg">O</span>
            <span className="absolute inset-x-0 bottom-0 h-1 bg-brand" aria-hidden />
          </div>
          <div className="hidden min-w-0 leading-tight sm:block">
            <p className="font-display truncate text-base font-semibold tracking-tight">Soline</p>
            <p className="text-xs text-muted-foreground">Espace pro</p>
          </div>
        </Link>

        <nav
          className="hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto overflow-y-hidden lg:flex [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="Navigation principale"
        >
          {APP_NAV_PRIMARY.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isNavItemActive(pathname, item)}
              compact
            />
          ))}

          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-xl px-2.5 py-2 text-sm font-semibold transition-colors outline-none lg:px-2.5 xl:px-3",
                moreActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              Plus
              <ChevronDown className="size-3.5 opacity-70" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-44">
              {APP_NAV_MORE.map((item) => {
                const Icon = item.icon;
                const active = isNavItemActive(pathname, item);
                return (
                  <DropdownMenuItem key={item.href} render={<Link href={item.href} />} className="gap-2">
                    <Icon className={cn("size-4 shrink-0", active && "text-primary")} />
                    <span className={cn(active && "font-semibold text-primary")}>{item.label}</span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-1.5">
          {isPlatformAdmin ? (
            <Link
              href="/admin"
              title="Administration"
              className={cn(
                "inline-flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors sm:size-auto sm:gap-1.5 sm:px-2.5 sm:py-2 sm:text-sm sm:font-semibold",
                pathname.startsWith("/admin")
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Shield className="size-4 shrink-0" />
              <span className="hidden 2xl:inline">Admin</span>
            </Link>
          ) : null}
          <div className="hidden md:block">
            <InviteSomeoneDialog
              contextLabel="Je"
              canLinkClientToArtisan
              size="default"
              className="min-h-9 px-2.5 text-sm xl:min-h-10 xl:px-3"
            />
          </div>
          <ThemeToggle />
          <form action={signOut} className="hidden md:block">
            <Button
              variant="outline"
              size="default"
              type="submit"
              title="Quitter"
              className="min-h-9 gap-2 px-2.5 text-muted-foreground xl:min-h-10 xl:px-3"
            >
              <LogOut className="size-4 shrink-0" />
              <span className="hidden 2xl:inline">Quitter</span>
            </Button>
          </form>

          <Button
            ref={triggerRef}
            type="button"
            variant="outline"
            size="icon"
            className="size-9 shrink-0 lg:hidden"
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
