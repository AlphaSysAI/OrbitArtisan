"use client";

import { ChevronRight, Loader2, Search, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { generateTechnicalSheetAction } from "@/app/app/fiches/actions";
import { GenerateSheetForm } from "@/components/technical-sheets/sheet-actions";
import { SheetTrustBadge, type SheetTrust } from "@/components/technical-sheets/sheet-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { highlightParts, matchSheetText, searchTerms, type SheetSearchHit } from "@/lib/technical-sheets/sheet-search";

export type SheetListItem = {
  id: string;
  title: string;
  summary: string;
  tradesLabel: string;
  /** Tous les textes de la fiche, pour la recherche plein texte. */
  segments: string[];
  mine: boolean;
  trust: SheetTrust;
};

export type AiSheetListItem = { id: string; title: string; request: string; createdAt: string };

type Hit<T> = { item: T; hit: SheetSearchHit };

function Highlighted({ text, terms }: { text: string; terms: string[] }) {
  return (
    <>
      {highlightParts(text, terms).map((part, index) =>
        part.match ? (
          <mark key={index} className="rounded-sm bg-warning/30 px-0.5 text-foreground">
            {part.text}
          </mark>
        ) : (
          <React.Fragment key={index}>{part.text}</React.Fragment>
        ),
      )}
    </>
  );
}

function SheetCard({ sheet, hit, terms }: { sheet: SheetListItem; hit?: SheetSearchHit; terms: string[] }) {
  return (
    <li>
      <Link
        href={`/app/fiches/${sheet.id}`}
        className="group flex h-full items-start gap-3 rounded-2xl border bg-card p-4 shadow-sm transition-colors hover:border-primary/40"
      >
        <div className="min-w-0 flex-1 space-y-1.5">
          <SheetTrustBadge trust={sheet.trust} />
          <p className="font-semibold leading-snug">
            <Highlighted text={sheet.title} terms={terms} />
          </p>
          {hit?.excerpt ? (
            <p className="line-clamp-3 text-sm text-muted-foreground">
              … <Highlighted text={hit.excerpt} terms={terms} /> …
            </p>
          ) : (
            <p className="line-clamp-2 text-sm text-muted-foreground">{sheet.summary}</p>
          )}
          {!sheet.mine ? <p className="text-xs text-muted-foreground">{sheet.tradesLabel}</p> : null}
        </div>
        <ChevronRight className="mt-1 size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
      </Link>
    </li>
  );
}

function AiSheetRow({ sheet, terms }: { sheet: AiSheetListItem; terms: string[] }) {
  return (
    <li>
      <Link href={`/app/fiches/ia/${sheet.id}`} className="flex items-center gap-3 p-4 hover:bg-muted/50">
        <Sparkles className="size-4 shrink-0 text-warning" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">
            <Highlighted text={sheet.title} terms={terms} />
          </span>
          <span className="block text-xs text-muted-foreground">
            Non vérifiée · {new Date(sheet.createdAt).toLocaleDateString("fr-FR")}
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}

function bySearch<T>(items: T[], terms: string[], fields: (item: T) => { title: string; segments: string[] }): Hit<T>[] {
  return items
    .flatMap((item) => {
      const { title, segments } = fields(item);
      const hit = matchSheetText(title, segments, terms);
      return hit ? [{ item, hit }] : [];
    })
    .sort((a, b) => b.hit.score - a.hit.score);
}

export function SheetsBrowser({
  sheets,
  aiSheets,
  tradeLabel,
  initialQuery = "",
}: {
  sheets: SheetListItem[];
  aiSheets: AiSheetListItem[];
  /** Métier de l'artisan (null : pas encore renseigné). */
  tradeLabel: string | null;
  /** Recherche préremplie (lien de l'assistant). */
  initialQuery?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState(initialQuery);
  const [generating, startGenerating] = React.useTransition();
  const terms = searchTerms(query);
  const searching = terms.length > 0;

  const mine = sheets.filter((sheet) => sheet.mine);
  const sheetFields = (sheet: SheetListItem) => ({ title: sheet.title, segments: sheet.segments });
  const mineHits = searching ? bySearch(mine, terms, sheetFields) : [];
  const otherHits = searching ? bySearch(sheets.filter((sheet) => !sheet.mine), terms, sheetFields) : [];
  const aiHits = searching ? bySearch(aiSheets, terms, (s) => ({ title: s.title, segments: [s.request] })) : [];
  const nothingFound = searching && mineHits.length + otherHits.length + aiHits.length === 0;

  function searchOutsideCatalog() {
    const request = query.trim();
    if (request.length < 5) {
      toast.error("Décris le travail en quelques mots (au moins 5 caractères).");
      return;
    }
    startGenerating(async () => {
      const res = await generateTechnicalSheetAction(request);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      router.push(`/app/fiches/ia/${res.id}`);
    });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <form
          role="search"
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            if (nothingFound) searchOutsideCatalog();
          }}
        >
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Un mot ou un travail : disjoncteur, receveur, cloison acoustique…"
              className="h-11 pr-9 pl-9"
              aria-label="Rechercher dans les fiches techniques"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted"
                aria-label="Effacer la recherche"
              >
                <X className="size-4" aria-hidden />
              </button>
            ) : null}
          </div>
          {searching ? (
            <Button
              type="button"
              variant={nothingFound ? "default" : "outline"}
              className="h-11"
              disabled={generating}
              onClick={searchOutsideCatalog}
            >
              {generating ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
              {generating ? "Rédaction en cours…" : "Chercher hors catalogue"}
            </Button>
          ) : null}
        </form>
        <p className="text-xs text-muted-foreground">
          La recherche porte sur tout le contenu des fiches : titres, étapes, matériel, sécurité et normes.
          {searching ? " « Chercher hors catalogue » fait rédiger une fiche par l'IA (non vérifiée, 10 par jour)." : ""}
        </p>
      </div>

      {searching ? (
        <div className="space-y-6">
          {mineHits.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">
                {mineHits.length} fiche{mineHits.length > 1 ? "s" : ""} de ton métier
              </h2>
              <ul className="grid gap-3 md:grid-cols-2">
                {mineHits.map(({ item, hit }) => (
                  <SheetCard key={item.id} sheet={item} hit={hit} terms={terms} />
                ))}
              </ul>
            </section>
          ) : null}

          {aiHits.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">Dans mes fiches générées</h2>
              <ul className="divide-y rounded-2xl border bg-card shadow-sm">
                {aiHits.map(({ item }) => (
                  <AiSheetRow key={item.id} sheet={item} terms={terms} />
                ))}
              </ul>
            </section>
          ) : null}

          {otherHits.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">
                {mineHits.length > 0 ? "Aussi dans d'autres métiers" : "Dans d'autres métiers"}
              </h2>
              <ul className="grid gap-3 md:grid-cols-2">
                {otherHits.map(({ item, hit }) => (
                  <SheetCard key={item.id} sheet={item} hit={hit} terms={terms} />
                ))}
              </ul>
            </section>
          ) : null}

          {nothingFound ? (
            <div className="space-y-3 rounded-2xl border border-dashed p-6 text-center">
              <p className="text-sm text-muted-foreground">
                Aucune fiche du catalogue ne contient « {query.trim()} ».
              </p>
              <Button disabled={generating} onClick={searchOutsideCatalog}>
                {generating ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
                {generating ? "Rédaction en cours (jusqu'à une minute)…" : "Chercher hors catalogue avec l'IA"}
              </Button>
              <p className="text-xs text-muted-foreground">La fiche rédigée sera marquée « non vérifiée ».</p>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-8">
          <section className="space-y-3">
            <h2 className="font-display text-xl font-semibold">
              {tradeLabel ? `Fiches ${tradeLabel}` : "Tes fiches"}
              {mine.length > 0 ? <span className="ml-2 text-base font-normal text-muted-foreground">{mine.length}</span> : null}
            </h2>
            {mine.length > 0 ? (
              <ul className="grid gap-3 md:grid-cols-2">
                {mine.map((sheet) => (
                  <SheetCard key={sheet.id} sheet={sheet} terms={[]} />
                ))}
              </ul>
            ) : (
              <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                {tradeLabel ? (
                  "Pas encore de fiche relue pour ton métier : elles arrivent. En attendant, cherche un mot ci-dessus ou demande une fiche à l'IA."
                ) : (
                  <>
                    Renseigne ton métier dans{" "}
                    <Link href="/app/reglages?tab=activite" className="font-medium text-primary underline-offset-4 hover:underline">
                      Mon activité
                    </Link>{" "}
                    pour voir tes fiches. Tu peux déjà chercher un mot ci-dessus.
                  </>
                )}
              </p>
            )}
          </section>

          {aiSheets.length > 0 ? (
            <section className="space-y-3">
              <h2 className="font-display text-xl font-semibold">Mes fiches générées</h2>
              <ul className="divide-y rounded-2xl border bg-card shadow-sm">
                {aiSheets.map((sheet) => (
                  <AiSheetRow key={sheet.id} sheet={sheet} terms={[]} />
                ))}
              </ul>
            </section>
          ) : null}

          <section className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
            <div className="space-y-1">
              <h2 className="font-display text-lg font-semibold">Une fiche qui n&apos;est pas dans le catalogue ?</h2>
              <p className="text-sm text-muted-foreground">
                Décris le travail : l&apos;IA rédige une fiche pas à pas. Elle n&apos;est relue par personne : à vérifier
                avant de l&apos;appliquer.
              </p>
            </div>
            <GenerateSheetForm />
          </section>
        </div>
      )}
    </div>
  );
}
