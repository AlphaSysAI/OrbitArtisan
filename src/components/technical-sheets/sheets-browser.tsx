"use client";

import { ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { GenerateSheetForm } from "@/components/technical-sheets/sheet-actions";
import { SheetTrustBadge, type SheetTrust } from "@/components/technical-sheets/sheet-view";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { foldSearchText } from "@/lib/work-library/platform-catalog-search";

export type SheetListItem = {
  id: string;
  title: string;
  summary: string;
  familyId: string;
  tradesLabel: string;
  searchText: string;
  mine: boolean;
  trust: SheetTrust;
};

type Family = { id: string; label: string; count: number };

const MINE = "mine";
const ALL = "all";

export function SheetsBrowser({
  sheets,
  families,
  hasTrade,
}: {
  sheets: SheetListItem[];
  families: Family[];
  /** Le métier de l'artisan a au moins une fiche : filtre « Mon métier » par défaut. */
  hasTrade: boolean;
}) {
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState(hasTrade ? MINE : ALL);

  const terms = foldSearchText(query).split(" ").filter((t) => t.length > 1);
  const visible = sheets.filter((sheet) => {
    // Une recherche porte sur toute la bibliothèque, quel que soit le filtre.
    if (terms.length === 0) {
      if (filter === MINE && !sheet.mine) return false;
      if (filter !== MINE && filter !== ALL && sheet.familyId !== filter) return false;
    }
    return terms.every((term) => sheet.searchText.includes(term));
  });

  const suggestedRequest = terms.length > 0 && visible.length === 0 ? query.trim() : "";

  const chips: { id: string; label: string }[] = [
    ...(hasTrade ? [{ id: MINE, label: "Mon métier" }] : []),
    { id: ALL, label: "Toutes" },
    ...families.map((f) => ({ id: f.id, label: f.label })),
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher : tableau électrique, receveur, cloison…"
            className="h-11 pl-9"
            aria-label="Rechercher une fiche technique"
          />
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => setFilter(chip.id)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors",
                filter === chip.id && terms.length === 0
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card hover:bg-muted",
              )}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {visible.length > 0 ? (
        <ul className="grid gap-3 md:grid-cols-2">
          {visible.map((sheet) => (
            <li key={sheet.id}>
              <Link
                href={`/app/fiches/${sheet.id}`}
                className="group flex h-full items-start gap-3 rounded-2xl border bg-card p-4 shadow-sm transition-colors hover:border-primary/40"
              >
                <div className="min-w-0 flex-1 space-y-1.5">
                  <SheetTrustBadge trust={sheet.trust} />
                  <p className="font-semibold leading-snug">{sheet.title}</p>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{sheet.summary}</p>
                  <p className="text-xs text-muted-foreground">{sheet.tradesLabel}</p>
                </div>
                <ChevronRight className="mt-1 size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          {terms.length > 0
            ? "Aucune fiche de la bibliothèque ne correspond. Tu peux en demander une à l'IA ci-dessous."
            : "Pas encore de fiche pour ce métier. Tu peux en demander une à l'IA ci-dessous."}
        </p>
      )}

      <section className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
        <div className="space-y-1">
          <h2 className="font-display text-lg font-semibold">Il te manque une fiche ?</h2>
          <p className="text-sm text-muted-foreground">
            Décris le travail : l&apos;IA rédige une fiche pas à pas. Elle n&apos;est relue par personne : à vérifier avant
            de l&apos;appliquer.
          </p>
        </div>
        {/* Recherche sans résultat : la demande à l'IA reprend les mots cherchés. */}
        <GenerateSheetForm key={suggestedRequest} initialRequest={suggestedRequest} />
      </section>
    </div>
  );
}
