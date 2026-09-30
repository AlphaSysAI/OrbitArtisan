"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/** Régime de TVA : normal (TVA facturée) ou franchise en base (art. 293 B du CGI). */
export function VatRegimeField({ defaultValue }: { defaultValue: "normal" | "franchise" | null }) {
  const [value, setValue] = React.useState<"normal" | "franchise" | null>(defaultValue);
  return (
    <fieldset className="space-y-2 sm:col-span-2">
      <legend className="text-sm font-medium">Régime de TVA</legend>
      <input type="hidden" name="vat_regime" value={value ?? ""} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {(
          [
            ["normal", "Je facture la TVA", "20 %, 10 % ou 5,5 % selon les travaux."],
            ["franchise", "Franchise en base (293 B)", "Pas de TVA : « TVA non applicable, art. 293 B du CGI »."],
          ] as const
        ).map(([v, label, hint]) => (
          <button
            key={v}
            type="button"
            onClick={() => setValue(v)}
            className={cn(
              "rounded-xl border p-3 text-left text-sm",
              value === v ? "border-foreground ring-1 ring-foreground" : "hover:bg-muted/40",
            )}
          >
            <span className="block font-medium">{label}</span>
            <span className="block text-xs text-muted-foreground">{hint}</span>
          </button>
        ))}
      </div>
      {value === "franchise" ? (
        <p className="text-xs text-muted-foreground">N° de TVA intracommunautaire facultatif en franchise.</p>
      ) : null}
    </fieldset>
  );
}
