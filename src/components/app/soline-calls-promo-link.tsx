"use client";

import Link from "next/link";
import { Phone, Sparkles } from "lucide-react";

import { NavBadge } from "@/components/notifications/nav-badge";
import { useNotifications } from "@/components/notifications/notification-provider";
import { cn } from "@/lib/utils";
import { SOLINE_CALLS_HUB_PATH } from "@/lib/voice/soline-voice-access";

type Variant = "header" | "banner" | "menuTile";

export function SolineCallsPromoLink({
  variant = "header",
  className,
  onClick,
}: {
  variant?: Variant;
  className?: string;
  onClick?: () => void;
}) {
  const { badgeCount } = useNotifications();
  const pending = badgeCount("voice_intakes");

  if (variant === "banner") {
    return (
      <Link
        href={SOLINE_CALLS_HUB_PATH}
        onClick={onClick}
        className={cn(
          "group relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-brand/35 bg-gradient-to-br from-brand/15 via-background to-primary/10 p-5 shadow-sm transition-shadow hover:shadow-md sm:flex-row sm:items-center sm:justify-between",
          className,
        )}
      >
        <div className="relative z-[1] flex min-w-0 items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand text-brand-foreground shadow-sm">
            <Phone className="size-6" aria-hidden />
          </span>
          <div className="min-w-0 space-y-1">
            <p className="flex flex-wrap items-center gap-2 font-display text-lg font-semibold tracking-tight">
              Appels Soline
              <Sparkles className="size-4 text-brand" aria-hidden />
              <NavBadge count={pending} variant="inline" />
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Ta secrétaire IA décroche, qualifie les demandes et te prépare des devis à valider.
            </p>
          </div>
        </div>
        <span className="relative z-[1] inline-flex shrink-0 items-center justify-center rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-foreground shadow-sm transition-transform group-hover:scale-[1.02]">
          Ouvrir
        </span>
        <span
          className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full bg-brand/20 blur-2xl"
          aria-hidden
        />
      </Link>
    );
  }

  if (variant === "menuTile") {
    return (
      <Link
        href={SOLINE_CALLS_HUB_PATH}
        onClick={onClick}
        className={cn(
          "col-span-2 flex items-center gap-3 rounded-2xl border-2 border-brand/40 bg-gradient-to-r from-brand/20 to-primary/10 p-4 shadow-sm transition-colors hover:from-brand/25 sm:col-span-3",
          className,
        )}
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-foreground">
          <Phone className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 font-display text-base font-semibold">
            Appels Soline
            <NavBadge count={pending} variant="inline" />
          </span>
          <span className="block text-xs text-muted-foreground">Secrétaire vocale &amp; devis IA</span>
        </span>
      </Link>
    );
  }

  return (
    <Link
      href={SOLINE_CALLS_HUB_PATH}
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center gap-2 rounded-xl border border-brand/45 bg-brand/15 px-3 py-2 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-brand/25 lg:px-3.5",
        className,
      )}
    >
      <Phone className="size-4 shrink-0 text-brand" aria-hidden />
      <span className="hidden sm:inline">Appels Soline</span>
      <span className="sm:hidden">Soline</span>
      <NavBadge count={pending} variant="inline" />
    </Link>
  );
}
