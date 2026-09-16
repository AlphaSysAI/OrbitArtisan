"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

import { APP_NAV_BOTTOM, isNavItemActive } from "@/components/app/nav-items";
import { NavBadge } from "@/components/notifications/nav-badge";
import { useNotifications } from "@/components/notifications/notification-provider";
import { AppMobileMenuSheet } from "@/components/app/app-mobile-menu-sheet";
import { cn } from "@/lib/utils";

export function AppMobileBottomNav({ isPlatformAdmin = false }: { isPlatformAdmin?: boolean }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const { badgeCount } = useNotifications();

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const [leftA, leftB, rightA, rightB] = APP_NAV_BOTTOM;

  return (
    <>
      <nav
        className={cn(
          "fixed inset-x-0 bottom-0 border-t border-border/80 bg-background/95 backdrop-blur-xl lg:hidden",
          menuOpen ? "z-[90]" : "z-50",
        )}
        aria-label="Navigation mobile"
        style={{ paddingBottom: "max(0.35rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto grid h-[3.75rem] max-w-lg grid-cols-5 items-end px-2">
          {[leftA, leftB].map((item) => {
            const active = isNavItemActive(pathname, item);
            const Icon = item.icon;
            const count = item.badgeKey ? badgeCount(item.badgeKey) : 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 pb-2 text-[10px] font-semibold leading-none transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "relative flex size-9 items-center justify-center rounded-xl transition-colors",
                    active && "bg-primary/10",
                  )}
                >
                  <Icon className="size-5" />
                  <NavBadge count={count} className="right-0 top-0" />
                </span>
                {item.shortLabel}
              </Link>
            );
          })}

          <div className="relative z-10 flex justify-center pb-1">
            <button
              type="button"
              aria-expanded={menuOpen}
              aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu complet"}
              onClick={() => setMenuOpen((v) => !v)}
              className={cn(
                "relative -top-5 flex size-[3.75rem] items-center justify-center rounded-full border-2 border-brand bg-brand text-brand-foreground shadow-lg transition-transform active:scale-95",
                menuOpen && "border-foreground bg-foreground text-background",
              )}
            >
              {menuOpen ? <X className="size-7" strokeWidth={2.25} /> : <Menu className="size-7" />}
            </button>
          </div>

          {[rightA, rightB].map((item) => {
            const active = isNavItemActive(pathname, item);
            const Icon = item.icon;
            const count = item.badgeKey ? badgeCount(item.badgeKey) : 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 pb-2 text-[10px] font-semibold leading-none transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "relative flex size-9 items-center justify-center rounded-xl transition-colors",
                    active && "bg-primary/10",
                  )}
                >
                  <Icon className="size-5" />
                  <NavBadge count={count} className="right-0 top-0" />
                </span>
                {item.shortLabel}
              </Link>
            );
          })}
        </div>
      </nav>

      <AppMobileMenuSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        pathname={pathname}
        isPlatformAdmin={isPlatformAdmin}
      />
    </>
  );
}
