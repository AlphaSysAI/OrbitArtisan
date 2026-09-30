"use client";

import * as React from "react";
import { toast } from "sonner";

import { setOpsNudgesEnabled } from "@/lib/telemetry/actions";

export function OpsNudgesToggle({ initial }: { initial: boolean }) {
  const [enabled, setEnabled] = React.useState(initial);
  return (
    <label className="flex cursor-pointer items-start gap-3 border-t pt-4 text-sm">
      <input
        type="checkbox"
        className="mt-0.5 size-5"
        checked={enabled}
        onChange={async (e) => {
          const next = e.target.checked;
          setEnabled(next);
          const res = await setOpsNudgesEnabled(next);
          if (!res.ok) {
            setEnabled(!next);
            toast.error("Réglage non enregistré.");
          }
        }}
      />
      <span>
        <span className="font-medium">Rappels utiles</span>
        <span className="block text-muted-foreground">
          Une alerte courte (notification, ou SMS en dernier recours) si des devis attendent ta validation ou si ton renvoi
          d&apos;appel semble coupé. Jamais de publicité, 1 rappel tous les 3 jours au plus.
        </span>
      </span>
    </label>
  );
}
