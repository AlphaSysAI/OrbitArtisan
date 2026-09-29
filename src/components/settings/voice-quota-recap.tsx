import { formatCentsHtEur } from "@/lib/billing/subscription-plans";
import type { VoiceQuotaSnapshot } from "@/lib/voice/voice-quota-types";
import { cn } from "@/lib/utils";

/** Résumé compact du quota vocal (page Appels Soline et Réglages → Appels Soline). */
export function VoiceQuotaRecap({ quota, className }: { quota: VoiceQuotaSnapshot; className?: string }) {
  if (quota.callsIncluded <= 0) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        Les appels Soline sont inclus avec les formules Pro et Premium.
      </p>
    );
  }

  const periodHint = quota.isTrial ? "sur l'essai" : "ce mois-ci";

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-muted/25 px-3 py-2.5 text-sm",
        className,
      )}
      aria-label={`Quota appels Soline ${periodHint}`}
    >
      <span className="text-muted-foreground">Récap {periodHint} :</span>
      <span className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1">
        <span className="text-muted-foreground">Restants</span>
        <span className="font-semibold tabular-nums text-foreground">{quota.remainingCalls}</span>
        <span className="text-xs text-muted-foreground tabular-nums">/ {quota.callsIncluded}</span>
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1">
        <span className="text-muted-foreground">Hors forfait</span>
        <span className="font-semibold tabular-nums text-foreground">{quota.overageCalls}</span>
        {quota.overageCalls > 0 && quota.overageCallCents > 0 ? (
          <span className="text-xs text-muted-foreground">
            ({formatCentsHtEur(quota.overageAmountCents)} € HT)
          </span>
        ) : null}
      </span>
      {quota.mode === "message_only" ? (
        <span className="text-xs font-medium text-amber-800 dark:text-amber-300">Mode message seul</span>
      ) : null}
    </div>
  );
}
