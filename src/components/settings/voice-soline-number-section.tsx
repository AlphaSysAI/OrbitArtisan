"use client";

import Link from "next/link";
import { Phone } from "lucide-react";

import { buttonVariants } from "@/components/ui/button-variants";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPhoneFr } from "@/lib/phone";

type VoiceSolineNumberSectionProps = {
  phoneE164: string | null;
  planIncludesVoice: boolean;
  /** Essai sans carte : numéro activé dès l'enregistrement d'un moyen de paiement. */
  needsPaymentMethod?: boolean;
  subscriptionHref: string;
};

export function VoiceSolineNumberSection({
  phoneE164,
  planIncludesVoice,
  needsPaymentMethod = false,
  subscriptionHref,
}: VoiceSolineNumberSectionProps) {
  const displayValue = phoneE164 ? formatPhoneFr(phoneE164) : "";
  const placeholder = !planIncludesVoice
    ? "Inclus avec les formules Pro et Premium"
    : phoneE164
      ? ""
      : needsPaymentMethod
        ? "À activer"
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
            {!planIncludesVoice
              ? "Passez à une formule Pro ou Premium pour activer la secrétaire vocale Soline."
              : needsPaymentMethod
                ? "Choisissez votre formule pour activer votre numéro : 0 € aujourd'hui, premier prélèvement à la fin de l'essai, résiliable à tout moment avant."
                : phoneE164
                  ? "Ce numéro vous est attribué par Soline. Pour le modifier, contactez le support."
                  : "Votre numéro est en cours d'activation (quelques minutes). Actualisez la page."}
          </p>
          {!planIncludesVoice || needsPaymentMethod ? (
            <Link href={subscriptionHref} className={buttonVariants({ className: "mt-2" })}>
              {needsPaymentMethod ? "Activer mon numéro Soline" : "Voir les formules Pro et Premium"}
            </Link>
          ) : null}
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
