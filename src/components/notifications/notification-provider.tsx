"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import { markNotificationCategorySeen } from "@/lib/notifications/actions";
import type { NotificationCountsResult } from "@/lib/notifications/counts";
import { seenCategoryForPath } from "@/lib/notifications/seen-category";
import type { NotificationBadgeKey, NotificationCategory, NotificationCounts } from "@/lib/notifications/types";

const POLL_INTERVAL_MS = 90_000;

type NotificationContextValue = {
  counts: NotificationCounts | null;
  badgeCount: (key: NotificationBadgeKey) => number;
  refresh: () => Promise<void>;
};

const NotificationContext = React.createContext<NotificationContextValue | null>(null);

const EMPTY: NotificationCounts = {
  ok: true,
  messages: 0,
  quotes_accepted: 0,
  quotes_received: 0,
  voice_intakes: 0,
  invoices_received: 0,
  is_artisan: false,
};

function totalBadgeCount(counts: NotificationCounts) {
  return (
    counts.messages +
    counts.quotes_accepted +
    counts.quotes_received +
    counts.voice_intakes +
    counts.invoices_received
  );
}

function syncAppBadge(counts: NotificationCounts | null) {
  if (typeof navigator === "undefined" || !("setAppBadge" in navigator)) return;
  const total = counts ? totalBadgeCount(counts) : 0;
  if (total > 0) {
    void navigator.setAppBadge(total).catch(() => {});
  } else {
    void navigator.clearAppBadge?.().catch(() => {});
  }
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [counts, setCounts] = React.useState<NotificationCounts | null>(null);
  const inFlightRef = React.useRef(false);
  const markingRef = React.useRef(new Set<NotificationCategory>());

  // GET dédié plutôt qu'une server action : ne bloque pas la file des
  // server actions (envois de formulaires) — perf, point 4.
  const refresh = React.useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const res = await fetch("/api/notifications/counts", { cache: "no-store" });
      if (!res.ok) return;
      const result = (await res.json()) as NotificationCountsResult;
      if (result.ok) {
        setCounts(result);
        syncAppBadge(result);
      }
    } catch {
      // Réseau instable (chantier) : on garde les derniers compteurs connus.
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  React.useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => {
      // Pas de polling onglet masqué : le retour au premier plan rafraîchit.
      if (document.visibilityState === "visible") void refresh();
    }, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  // Solde la catégorie de la page visitée, uniquement si le badge est non nul
  // (avant : une server action + revalidatePath + refetch à CHAQUE navigation
  // sous /app/quotes). Mise à jour optimiste du badge, refetch seulement en
  // cas d'échec.
  const seenCategory = seenCategoryForPath(pathname);
  const pendingSeenCount = seenCategory && counts ? counts[seenCategory] : 0;

  React.useEffect(() => {
    if (!seenCategory || pendingSeenCount <= 0) return;
    if (markingRef.current.has(seenCategory)) return;
    markingRef.current.add(seenCategory);

    setCounts((prev) => {
      if (!prev) return prev;
      const next = { ...prev, [seenCategory]: 0 };
      syncAppBadge(next);
      return next;
    });

    void markNotificationCategorySeen(seenCategory)
      .then((res) => {
        if (!res.ok) void refresh();
      })
      .catch(() => void refresh())
      .finally(() => {
        markingRef.current.delete(seenCategory);
      });
  }, [seenCategory, pendingSeenCount, refresh]);

  const badgeCount = React.useCallback(
    (key: NotificationBadgeKey) => {
      const c = counts ?? EMPTY;
      switch (key) {
        case "inbox":
          // « À traiter » : appels à valider + messages non lus + devis acceptés non vus.
          return c.voice_intakes + c.messages + c.quotes_accepted;
        case "messages":
          return c.messages;
        case "quotes_accepted":
          return c.quotes_accepted;
        case "quotes_received":
          return c.quotes_received;
        case "voice_intakes":
          return c.voice_intakes;
        case "invoices_received":
          return c.invoices_received;
        default:
          return 0;
      }
    },
    [counts],
  );

  const value = React.useMemo(
    () => ({ counts, badgeCount, refresh }),
    [counts, badgeCount, refresh],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const ctx = React.useContext(NotificationContext);
  if (!ctx) {
    return {
      counts: null,
      badgeCount: () => 0,
      refresh: async () => {},
    };
  }
  return ctx;
}
