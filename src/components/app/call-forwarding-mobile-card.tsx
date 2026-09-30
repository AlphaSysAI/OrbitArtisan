import Link from "next/link";

import { CallForwardingMobileActions } from "@/components/app/call-forwarding-mobile-actions";
import {
  buildActivateCallForwardingCode,
  CANCEL_CALL_FORWARDING_CODE,
} from "@/lib/voice/call-forwarding-ussd";
import { cn } from "@/lib/utils";

type CallForwardingMobileCardProps = {
  solinePhoneE164: string | null;
  className?: string;
};

/**
 * Raccourcis USSD renvoi d'appel — affiché sur le tableau de bord mobile uniquement.
 */
export function CallForwardingMobileCard({ solinePhoneE164, className }: CallForwardingMobileCardProps) {
  const activateCode = solinePhoneE164 ? buildActivateCallForwardingCode(solinePhoneE164) : null;
  const canActivate = Boolean(solinePhoneE164 && activateCode);

  return (
    <section
      className={cn(
        "rounded-2xl border border-border/70 bg-muted/25 p-4 lg:hidden",
        className,
      )}
      aria-labelledby="call-forwarding-mobile-title"
    >
      <h2 id="call-forwarding-mobile-title" className="font-display text-base font-semibold tracking-tight">
        Renvoi d&apos;appel vers Soline
      </h2>

      {!canActivate ? (
        <p className="mt-3 text-sm text-amber-900 dark:text-amber-200">
          Ton numéro Soline n&apos;est pas encore attribué. Consulte{" "}
          <Link href="/app/reglages?tab=vocal" className="font-semibold underline-offset-4 hover:underline">
            Réglages → Appels Soline
          </Link>
          .
        </p>
      ) : null}

      <div className={cn(canActivate ? "mt-4" : "mt-3")}>
        <CallForwardingMobileActions
          activateCode={activateCode}
          cancelCode={CANCEL_CALL_FORWARDING_CODE}
          disabled={!canActivate}
        />
      </div>
    </section>
  );
}
