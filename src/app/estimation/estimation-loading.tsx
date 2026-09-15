"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

export const ESTIMATION_LOADING_MESSAGES = [
  { afterMs: 0, text: "On chiffre ta demande…" },
  { afterMs: 2500, text: "Nous analysons ton besoin en détail…" },
  {
    afterMs: 5000,
    text: "Nous interrogeons notre base locale pour calibrer les tarifs près de chez toi…",
  },
  { afterMs: 8000, text: "Estimation des matériaux et de la main-d'œuvre…" },
  {
    afterMs: 12000,
    text: "Encore quelques secondes pour une fourchette la plus précise possible…",
  },
] as const;

export function EstimationLoadingPanel() {
  const [messageIndex, setMessageIndex] = React.useState(0);
  const startedAtRef = React.useRef(Date.now());

  React.useEffect(() => {
    const tick = () => {
      const elapsed = Date.now() - startedAtRef.current;
      let idx = 0;
      for (let i = ESTIMATION_LOADING_MESSAGES.length - 1; i >= 0; i -= 1) {
        if (elapsed >= ESTIMATION_LOADING_MESSAGES[i].afterMs) {
          idx = i;
          break;
        }
      }
      setMessageIndex(idx);
    };

    tick();
    const id = window.setInterval(tick, 800);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border bg-card px-6 py-20 text-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      <p className="max-w-sm text-sm text-muted-foreground transition-opacity duration-300">
        {ESTIMATION_LOADING_MESSAGES[messageIndex].text}
      </p>
    </div>
  );
}
