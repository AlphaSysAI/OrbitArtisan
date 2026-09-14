import Link from "next/link";
import { AlertCircle, CheckCircle2 } from "lucide-react";

import type { ArtisanMatchingReadiness } from "@/lib/leads/artisan-matching-readiness";
import { cn } from "@/lib/utils";

function Item({
  ok,
  label,
  href,
}: {
  ok: boolean;
  label: string;
  href?: string;
}) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {ok ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
      ) : (
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
      )}
      <span className={cn(!ok && "text-foreground")}>
        {href && !ok ? (
          <Link href={href} className="font-medium underline underline-offset-4">
            {label}
          </Link>
        ) : (
          label
        )}
      </span>
    </li>
  );
}

export function LeadMatchingReadiness({ readiness }: { readiness: ArtisanMatchingReadiness }) {
  if (readiness.ready) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
        <p className="font-medium text-emerald-900 dark:text-emerald-100">
          Tu es visible dans les recherches du tunnel d’estimation
        </p>
        <p className="mt-1 text-muted-foreground">
          Les prospects qui choisissent ton métier et se trouvent à moins de 40 km pourront te
          sélectionner.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
      <p className="text-sm font-medium">Pour apparaître dans les recherches /estimation</p>
      <ul className="mt-3 space-y-2 text-muted-foreground">
        <Item
          ok={readiness.matchingEnabled}
          label="Activer « Recevoir des demandes d’estimation » ci-dessous"
        />
        <Item
          ok={readiness.hasTrade}
          label="Renseigner ton secteur et métier (Mon activité)"
          href="/app/reglages?tab=activite"
        />
        <Item
          ok={readiness.hasAddressText && readiness.hasGeo}
          label="Enregistrer ton adresse avec coordonnées GPS (Coordonnées)"
          href="/app/reglages?tab=coordonnees"
        />
      </ul>
      {readiness.hasAddressText && !readiness.hasGeo ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Une adresse est enregistrée mais sans position GPS : rouvre l’onglet Coordonnées, choisis
          ton adresse dans la liste déroulante, puis enregistre.
        </p>
      ) : null}
    </div>
  );
}
