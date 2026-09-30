import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { formatPhoneFr } from "@/lib/concierge/format-phone";
import type { ProspectRow, ProspectStatus } from "@/lib/concierge/admin-queries";
import { findTrade } from "@/lib/trades/taxonomy";

const STATUS: Record<ProspectStatus, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  new: { label: "Nouveau", variant: "secondary" },
  contacted: { label: "Contacté", variant: "outline" },
  converted: { label: "Inscrit", variant: "default" },
  blacklisted: { label: "Ne plus contacter", variant: "destructive" },
};

export function ProspectStatusBadge({ status }: { status: ProspectStatus }) {
  const s = STATUS[status];
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

export function tradeLabel(p: Pick<ProspectRow, "trade" | "trade_category">): string {
  return findTrade(p.trade_category, p.trade)?.label ?? p.trade;
}

/** Nom + téléphone cliquable (appel direct depuis le mobile). */
export function ProspectIdentity({ p }: { p: ProspectRow }) {
  return (
    <div className="min-w-0">
      <Link href={`/admin/conciergerie/prospects/${p.id}`} className="font-medium hover:underline">
        {p.business_name}
      </Link>
      <p className="text-sm text-muted-foreground">
        {tradeLabel(p)} · {[p.postal_code, p.city].filter(Boolean).join(" ") || "commune inconnue"}
      </p>
      <a href={`tel:${p.phone}`} className="text-base font-semibold tabular-nums text-primary">
        {formatPhoneFr(p.phone)}
      </a>
    </div>
  );
}
