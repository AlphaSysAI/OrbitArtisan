"use client";

import { Phone } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function formatPhoneE164(raw: string | null | undefined): string {
  if (!raw?.trim()) return "";
  const n = raw.trim();
  if (n.startsWith("+33") && n.length >= 11) {
    const local = "0" + n.slice(3);
    return local.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
  }
  return n;
}

export type VoiceSolineNumberSectionProps = {
  phoneE164: string | null;
  planIncludesVoice: boolean;
};

export function VoiceSolineNumberSection({ phoneE164, planIncludesVoice }: VoiceSolineNumberSectionProps) {
  const displayValue = phoneE164 ? formatPhoneE164(phoneE164) : "";
  const placeholder = !planIncludesVoice
    ? "Inclus avec les formules Pro et Premium"
    : phoneE164
      ? ""
      : "Attribution en cours…";

  return (
    <div className="space-y-8">
        <div className="space-y-3">
          <Label htmlFor="voice-phone-readonly" className="text-base">
            Numéro Soline
          </Label>
          <div className="relative">
            <Phone className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="voice-phone-readonly"
              type="tel"
              readOnly
              disabled
              value={displayValue}
              placeholder={placeholder}
              className="h-12 cursor-not-allowed bg-muted/60 pl-10 font-mono text-base opacity-100"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {planIncludesVoice
              ? "Ce numéro vous est attribué par Soline. Pour le modifier, contactez le support."
              : "Passez à une formule Pro ou Premium pour activer la secrétaire vocale Soline."}
          </p>
        </div>

        <div className="rounded-2xl border border-border/70 bg-muted/40 p-5">
          <p className="font-display text-lg font-semibold tracking-tight">Comment ça marche ?</p>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
            <li>Les clients appellent votre numéro Soline (ou un renvoi depuis votre ligne habituelle)</li>
            <li>Soline accueille l&apos;appel et qualifie la demande</li>
            <li>Vous retrouvez le résumé et une proposition de devis dans « Appels »</li>
            <li>Vous validez avant envoi au client</li>
          </ul>
        </div>
      </div>
  );
}
