"use client";

import * as React from "react";

import { recordDailyPresence } from "@/lib/telemetry/actions";
import { parisDayKey } from "@/lib/format/date";

const KEY = "soline:presence-day";

/** Signale l'ouverture de l'app une fois par jour (hors ligne ou storage bloqué : sans effet). */
export function ActivityPing() {
  React.useEffect(() => {
    const day = parisDayKey();
    try {
      if (localStorage.getItem(KEY) === day) return;
    } catch {
      /* storage indisponible : on envoie quand même, l'upsert est idempotent */
    }
    void recordDailyPresence()
      .then(() => {
        try {
          localStorage.setItem(KEY, day);
        } catch {
          /* ignoré */
        }
      })
      .catch(() => undefined);
  }, []);
  return null;
}
