import { Badge } from "@/components/ui/badge";
import { SUBSCRIPTION_HINT, subscriptionLabel, type AdminSubscriptionStatus } from "@/lib/admin/labels";
import { findSubscriptionPlan } from "@/lib/billing/subscription-plans";
import { formatDateFr } from "@/lib/format/date";
import { cn } from "@/lib/utils";

const TONE: Record<AdminSubscriptionStatus, string> = {
  incomplete: "border-border text-muted-foreground",
  trialing: "border-sky-400/50 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  active: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  past_due: "border-destructive/40 bg-destructive/10 text-destructive",
  canceled: "border-border bg-muted text-muted-foreground",
};

/**
 * État commercial d'un artisan en un coup d'œil : la formule n'est affichée que si un
 * abonnement existe (sans abonnement, subscription_plan n'est qu'une valeur par défaut).
 */
export function SubscriptionBadges({
  status,
  plan,
  trialEndsAt,
  accountStatus,
  deletedAt,
}: {
  status: string;
  plan: string;
  trialEndsAt?: string | null;
  accountStatus?: string | null;
  deletedAt?: string | null;
}) {
  const s = status as AdminSubscriptionStatus;
  const planName = findSubscriptionPlan(plan)?.name ?? plan;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge variant="outline" className={cn(TONE[s] ?? "")} title={SUBSCRIPTION_HINT[s]}>
        {subscriptionLabel(status)}
        {s !== "incomplete" ? ` · ${planName}` : ""}
      </Badge>
      {s === "trialing" && trialEndsAt ? (
        <span className="text-xs text-muted-foreground">jusqu&apos;au {formatDateFr(trialEndsAt)}</span>
      ) : null}
      {deletedAt ? (
        <Badge variant="outline">Archivé</Badge>
      ) : accountStatus === "suspended" ? (
        <Badge variant="destructive">Suspendu</Badge>
      ) : null}
    </div>
  );
}
