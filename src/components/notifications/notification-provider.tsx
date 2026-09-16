"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import {
  fetchNotificationCounts,
  markNotificationCategorySeen,
} from "@/lib/notifications/actions";
import type { NotificationBadgeKey, NotificationCounts } from "@/lib/notifications/types";

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

  const refresh = React.useCallback(async () => {
    const result = await fetchNotificationCounts();
    if (result.ok) {
      setCounts(result);
      syncAppBadge(result);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => {
      void refresh();
    }, 25_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  React.useEffect(() => {
    if (!pathname) return;

    const tasks: Promise<unknown>[] = [];

    if (pathname.startsWith("/app/quotes")) {
      tasks.push(markNotificationCategorySeen("quotes_accepted").then(() => refresh()));
    }
    // voice_intakes n'est plus marqué "vu" à la visite : le compteur ne
    // reflète que les appels encore pending_review (Point 12 de l'audit
    // pré-pilote) — il ne doit baisser qu'après une vraie validation/rejet.
    if (pathname.startsWith("/mes-devis")) {
      tasks.push(markNotificationCategorySeen("quotes_received").then(() => refresh()));
    }
    if (pathname.startsWith("/compte/factures")) {
      tasks.push(markNotificationCategorySeen("invoices_received").then(() => refresh()));
    }

    void Promise.all(tasks);
  }, [pathname, refresh]);

  const badgeCount = React.useCallback(
    (key: NotificationBadgeKey) => {
      const c = counts ?? EMPTY;
      switch (key) {
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
