"use client";

import { useEffect } from "react";
import Link from "next/link";
import { LogOut, Shield, X } from "lucide-react";
import { createPortal } from "react-dom";

import { APP_NAV_ITEMS, isNavItemActive } from "@/components/app/nav-items";
import { InviteSomeoneDialog } from "@/components/invitations/invite-someone-dialog";
import { Button } from "@/components/ui/button";
import { signOut } from "@/app/login/actions";
import { cn } from "@/lib/utils";

export function AppMobileMenuSheet({
  open,
  onClose,
  pathname,
  isPlatformAdmin,
}: {
  open: boolean;
  onClose: () => void;
  pathname: string;
  isPlatformAdmin: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
      {/* Backdrop : absorbe le clic sans le transmettre à la page */}
      <button
        type="button"
        tabIndex={-1}
        aria-label="Fermer le menu"
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }}
      />

      <div className="absolute inset-x-0 bottom-0 top-[12vh] flex flex-col rounded-t-3xl border border-border/80 bg-background shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-4 py-3">
          <p className="font-display text-lg font-semibold">Menu</p>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Fermer">
            <X className="size-5" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          <nav className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Navigation complète">
            {APP_NAV_ITEMS.map((item) => {
              const active = isNavItemActive(pathname, item);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={cn(
                    "flex min-h-[5.5rem] flex-col items-center justify-center gap-2 rounded-2xl border px-3 py-4 text-center text-sm font-semibold transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : "border-border/70 bg-muted/30 text-foreground hover:bg-muted",
                  )}
                >
                  <Icon className="size-6 shrink-0 opacity-90" />
                  <span className="leading-tight">{item.label}</span>
                </Link>
              );
            })}

            {isPlatformAdmin ? (
              <Link
                href="/admin"
                onClick={onClose}
                className={cn(
                  "flex min-h-[5.5rem] flex-col items-center justify-center gap-2 rounded-2xl border px-3 py-4 text-center text-sm font-semibold transition-colors",
                  pathname.startsWith("/admin")
                    ? "border-foreground bg-foreground text-background"
                    : "border-border/70 bg-muted/30 hover:bg-muted",
                )}
              >
                <Shield className="size-6 shrink-0" />
                Administration
              </Link>
            ) : null}
          </nav>
        </div>

        <div className="shrink-0 space-y-2 border-t border-border/60 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <InviteSomeoneDialog
            contextLabel="Je"
            canLinkClientToArtisan
            size="default"
            className="w-full justify-center"
          />
          <form action={signOut}>
            <Button variant="outline" type="submit" className="w-full gap-2 text-muted-foreground">
              <LogOut className="size-4" />
              Quitter
            </Button>
          </form>
        </div>
      </div>
    </div>,
    document.body,
  );
}
