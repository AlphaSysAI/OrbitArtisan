import { ArrowRight, Droplets, Flame, LifeBuoy, Sparkles, Zap } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { findTrade } from "@/lib/trades/taxonomy";

const QUICK_HELP = [
  { href: "/compte/depannage/client-fuite-eau-urgence", label: "Fuite d'eau", icon: Droplets },
  { href: "/compte/depannage/client-coupure-courant", label: "Plus de courant", icon: Zap },
  { href: "/compte/depannage/client-odeur-gaz", label: "Odeur de gaz", icon: Flame },
  { href: "/compte/depannage", label: "Toutes les fiches", icon: LifeBuoy },
];

/** Accueil client : « Un souci à la maison ? » + accès direct aux urgences. */
export function ClientHomeAssistance() {
  return (
    <section className="overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/10 via-card to-card p-5 shadow-sm sm:p-7">
      <div className="space-y-4">
        <div className="space-y-1">
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            <Sparkles className="size-3.5" aria-hidden /> Assistant dépannage
          </p>
          <h2 className="font-display text-xl font-semibold sm:text-2xl">Un souci à la maison ?</h2>
          <p className="text-sm text-muted-foreground">
            Décrivez-le : Soline vous dit quoi faire tout de suite et trouve un artisan près de chez vous si besoin.
          </p>
        </div>
        <form action="/compte/assistant" method="get" className="flex flex-col gap-2 sm:flex-row">
          <Input
            name="q"
            required
            minLength={3}
            maxLength={500}
            placeholder="Ex. : le disjoncteur saute dès que je lance la machine"
            className="h-12 bg-background text-base"
            aria-label="Décrivez votre souci"
          />
          <Button type="submit" size="lg" className="h-12 gap-2">
            Demander <ArrowRight className="size-4" aria-hidden />
          </Button>
        </form>
        <div className="flex flex-wrap gap-2">
          {QUICK_HELP.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-sm hover:bg-muted"
            >
              <Icon className="size-4 text-primary" aria-hidden /> {label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

export type ClientLeadRow = {
  id: string;
  status: "new" | "estimated" | "matched" | "converted" | "expired";
  trade_category: string | null;
  trade: string | null;
  description: string;
  created_at: string;
};

const LEAD_STATUS: Record<ClientLeadRow["status"], string> = {
  new: "En préparation",
  estimated: "Envoyée",
  matched: "Envoyée aux artisans",
  converted: "Prise en charge",
  expired: "Expirée",
};

/** Demandes de mise en relation envoyées depuis l'espace client. */
export function ClientLeadsList({ leads }: { leads: ClientLeadRow[] }) {
  if (leads.length === 0) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">Mes demandes</h2>
        <Link href="/compte/messages" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          Réponses des artisans
        </Link>
      </div>
      <ul className="divide-y rounded-2xl border bg-card">
        {leads.map((lead) => (
          <li key={lead.id} className="flex items-start gap-3 px-4 py-3">
            <span className="min-w-0 flex-1">
              <span className="block font-medium">
                {findTrade(lead.trade_category, lead.trade)?.label ?? "Artisan"} ·{" "}
                {new Date(lead.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
              </span>
              <span className="line-clamp-1 block text-sm text-muted-foreground">{lead.description}</span>
            </span>
            <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">{LEAD_STATUS[lead.status]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
