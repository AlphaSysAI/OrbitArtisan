"use client";

import * as React from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { getBrowserSupabase } from "@/lib/supabase/lazy-client";

/** Rythme du rattrapage quand le temps réel est indisponible. */
const FALLBACK_POLL_MS = 12_000;

/**
 * Mise à jour en direct d'un fil de messages (refacto latence, point 10).
 *
 * - Temps réel Supabase en priorité (INSERT sur `messages` du fil).
 * - Polling de secours UNIQUEMENT tant que le canal n'est pas `SUBSCRIBED`
 *   (avant : polling toutes les 12 s en permanence, en plus du temps réel).
 * - Rattrapage au retour au premier plan : sur mobile, le websocket est
 *   coupé quand l'écran se verrouille (chantier, poche).
 * - Aucun polling onglet masqué.
 *
 * `sync` doit être idempotent : recharger le fil et ne mettre à jour l'état
 * que si le dernier message a changé.
 */
export function useLiveConversation({
  conversationId,
  enabled,
  channelName,
  sync,
}: {
  conversationId: string | null;
  enabled: boolean;
  channelName: string;
  sync: () => Promise<void> | void;
}) {
  const syncRef = React.useRef(sync);
  React.useEffect(() => {
    syncRef.current = sync;
  }, [sync]);

  React.useEffect(() => {
    if (!enabled || !conversationId) return;

    let cancelled = false;
    let realtimeUp = false;
    let channel: RealtimeChannel | null = null;
    const run = () => {
      if (!cancelled) void syncRef.current();
    };

    void getBrowserSupabase()
      .then((supabase) => {
        if (cancelled) return;
        channel = supabase
          .channel(channelName)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "messages",
              filter: `conversation_id=eq.${conversationId}`,
            },
            run,
          )
          .subscribe((status) => {
            const wasUp = realtimeUp;
            realtimeUp = status === "SUBSCRIBED";
            // (Re)connexion : rattraper ce qui a pu arriver pendant la coupure.
            if (realtimeUp && !wasUp) run();
          });
      })
      .catch(() => {
        // Client indisponible : le polling de secours prend le relais.
      });

    const interval = window.setInterval(() => {
      if (!realtimeUp && document.visibilityState === "visible") run();
    }, FALLBACK_POLL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      if (channel) {
        const toRemove = channel;
        void getBrowserSupabase().then((supabase) => supabase.removeChannel(toRemove));
      }
    };
  }, [conversationId, enabled, channelName]);
}
