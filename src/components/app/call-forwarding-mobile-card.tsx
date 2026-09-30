import Link from "next/link";
import { PhoneForwarded, PhoneOff } from "lucide-react";

import { buttonVariants } from "@/components/ui/button-variants";
import {
  buildActivateCallForwardingCode,
  CANCEL_CALL_FORWARDING_CODE,
  ussdToTelHref,
} from "@/lib/voice/call-forwarding-ussd";
import { cn } from "@/lib/utils";

function formatPhoneE164ForDisplay(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const n = raw.trim();
  if (n.startsWith("+33") && n.length >= 11) {
    const local = "0" + n.slice(3);
    return local.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
  }
  return n;
}

type CallForwardingMobileCardProps = {
  solinePhoneE164: string | null;
  className?: string;
};

/**
 * Raccourcis USSD renvoi d'appel — affiché sur le tableau de bord mobile uniquement.
 * Compose *61*<numéro Soline>*11*12# ou ##002# pour tout couper.
 */
export function CallForwardingMobileCard({ solinePhoneE164, className }: CallForwardingMobileCardProps) {
  const activateCode = solinePhoneE164 ? buildActivateCallForwardingCode(solinePhoneE164) : null;
  const activateHref = activateCode ? ussdToTelHref(activateCode) : null;
  const cancelHref = ussdToTelHref(CANCEL_CALL_FORWARDING_CODE);
  const solineDisplay = formatPhoneE164ForDisplay(solinePhoneE164);

  return (
    <section
      className={cn(
        "rounded-2xl border border-border/70 bg-muted/25 p-4 lg:hidden",
        className,
      )}
      aria-labelledby="call-forwarding-mobile-title"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <PhoneForwarded className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 space-y-1">
          <h2 id="call-forwarding-mobile-title" className="font-display text-base font-semibold tracking-tight">
            Renvoi d&apos;appel vers Soline
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Depuis ton portable, compose le code en un tap pour rediriger tes appels vers ton numéro Soline
            {solineDisplay ? ` (${solineDisplay})` : ""}.
          </p>
        </div>
      </div>

      {!solinePhoneE164 || !activateHref ? (
        <p className="mt-3 text-sm text-amber-900 dark:text-amber-200">
          Ton numéro Soline n&apos;est pas encore attribué. Consulte{" "}
          <Link href="/app/reglages?tab=vocal" className="font-semibold underline-offset-4 hover:underline">
            Réglages → Appels Soline
          </Link>{" "}
          ou patiente quelques minutes après souscription Pro/Premium.
        </p>
      ) : (
        <p className="mt-3 font-mono text-xs text-muted-foreground break-all">{activateCode}</p>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        {activateHref ? (
          <a
            href={activateHref}
            className={buttonVariants({ className: "w-full gap-2 sm:flex-1" })}
          >
            <PhoneForwarded className="size-4" />
            Renvoi d&apos;appel
          </a>
        ) : (
          <span className={buttonVariants({ className: "pointer-events-none w-full gap-2 opacity-50 sm:flex-1" })}>
            <PhoneForwarded className="size-4" />
            Renvoi d&apos;appel
          </span>
        )}
        <a
          href={cancelHref}
          className={buttonVariants({ variant: "outline", className: "w-full gap-2 sm:flex-1" })}
        >
          <PhoneOff className="size-4" />
          Arrêter le transfert
        </a>
      </div>
    </section>
  );
}
