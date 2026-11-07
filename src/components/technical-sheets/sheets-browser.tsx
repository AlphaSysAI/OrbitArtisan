"use client";

import { ArrowLeft, ChevronRight, LayoutGrid, Loader2, Search, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { generateTechnicalSheetAction } from "@/app/app/fiches/actions";
import { GenerateSheetForm } from "@/components/technical-sheets/sheet-actions";
import { SheetTrustBadge, type SheetTrust } from "@/components/technical-sheets/sheet-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { highlightParts, matchSheetText, searchTerms, type SheetSearchHit } from "@/lib/technical-sheets/sheet-search";
import { cn } from "@/lib/utils";

export type SheetListItem = {
  id: string;
  title: string;
  summary: string;
  /** Famille de métiers de la fiche. */
  familyId: string;
  tradesLabel: string;
  /** Tous les textes de la fiche, pour la recherche plein texte. */
  segments: string[];
  mine: boolean;
  trust: SheetTrust;
};

export type AiSheetListItem = { id: string; title: string; request: string; createdAt: string };

export type SheetFamily = { id: string; label: string; count: number };

/** Ce qui est affiché : mon métier, la liste des métiers, ou un métier choisi. */
type Scope = { kind: "mine" } | { kind: "families" } | { kind: "family"; id: string };

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
  families,
  tradeLabel,
  initialQuery = "",
  initialFamilyId = null,
}: {
  sheets: SheetListItem[];
  aiSheets: AiSheetListItem[];
  /** Toutes les familles de métiers, avec leur nombre de fiches. */
  families: SheetFamily[];
  /** Métier de l'artisan (null : pas encore renseigné). */
  tradeLabel: string | null;
  /** Recherche préremplie (lien de l'assistant). */
  initialQuery?: string;
  /** Métier choisi dans l'URL (?metier=…), pour revenir au même endroit. */
  initialFamilyId?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = React.useState(initialQuery);
  const [scope, setScopeState] = React.useState<Scope>(() =>
    initialFamilyId && families.some((f) => f.id === initialFamilyId) ? { kind: "family", id: initialFamilyId } : { kind: "mine" },
  );
  const [generating, startGenerating] = React.useTransition();

  function setScope(next: Scope) {
    setScopeState(next);
    setQuery("");
    // Le métier choisi reste dans l'URL : retour arrière depuis une fiche au même endroit.
    const url = next.kind === "family" ? `${pathname}?metier=${encodeURIComponent(next.id)}` : pathname;
    router.replace(url, { scroll: false });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const terms = searchTerms(query);
  const searching = terms.length > 0;
  const family = scope.kind === "family" ? families.find((f) => f.id === scope.id) ?? null : null;

  const inScope =
    scope.kind === "mine" ? sheets.filter((s) => s.mine) : scope.kind === "family" ? sheets.filter((s) => s.familyId === scope.id) : [];
  const scopeLabel = scope.kind === "family" ? family?.label ?? "" : tradeLabel ?? "ton métier";

  const hits = searching ? bySearch(inScope, terms, (s) => ({ title: s.title, segments: s.segments })) : [];
  const aiHits =
    searching && scope.kind === "mine" ? bySearch(aiSheets, terms, (s) => ({ title: s.title, segments: [s.request] })) : [];
  const nothingFound = searching && hits.length + aiHits.length === 0;

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

  const outsideCatalogButton = (primary: boolean) => (
    <Button variant={primary ? "default" : "outline"} disabled={generating} onClick={searchOutsideCatalog}>
      {generating ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
      {generating ? "Rédaction en cours (jusqu'à une minute)…" : "Chercher hors catalogue avec l'IA"}
    </Button>
  );

  return (
    <div className="space-y-6">
      {/* Barre de recherche + accès aux autres métiers */}
      <div className="space-y-2">
        {scope.kind !== "families" ? (
          <form
            role="search"
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (nothingFound) searchOutsideCatalog();
            }}
          >
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={scope.kind === "family" ? `Rechercher dans ${scopeLabel}…` : "Rechercher dans mes fiches…"}
                className="h-11 pr-9 pl-9"
                aria-label={`Rechercher dans les fiches : ${scopeLabel}`}
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
            <Button type="button" variant="outline" className="h-11 shrink-0" onClick={() => setScope({ kind: "families" })}>
              <LayoutGrid aria-hidden /> Autres métiers
            </Button>
          </form>
        ) : null}

        {scope.kind === "family" ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full bg-primary px-3 py-1 font-medium text-primary-foreground">{scopeLabel}</span>
            <button
              type="button"
              onClick={() => setScope({ kind: "mine" })}
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" aria-hidden /> Revenir à mon métier
            </button>
          </div>
        ) : null}
      </div>

      {scope.kind === "families" ? (
        /* Liste des métiers */
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-xl font-semibold">Choisis un métier</h2>
            <Button variant="ghost" size="sm" onClick={() => setScope({ kind: "mine" })}>
              <ArrowLeft aria-hidden /> Mon métier
            </Button>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {families.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  disabled={f.count === 0}
                  onClick={() => setScope({ kind: "family", id: f.id })}
                  className={cn(
                    "flex h-full w-full items-center justify-between gap-3 rounded-2xl border bg-card p-4 text-left shadow-sm transition-colors",
                    f.count > 0 ? "hover:border-primary/40" : "cursor-not-allowed opacity-60",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block font-semibold leading-snug">{f.label}</span>
                    <span className="block text-xs text-muted-foreground">
                      {f.count > 0 ? `${f.count} fiche${f.count > 1 ? "s" : ""}` : "Bientôt"}
                    </span>
                  </span>
                  {f.count > 0 ? <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden /> : null}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : searching ? (
        /* Résultats de recherche, limités au métier affiché */
        <div className="space-y-6">
          {hits.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">
                {hits.length} fiche{hits.length > 1 ? "s" : ""} · {scopeLabel}
              </h2>
              <ul className="grid gap-3 md:grid-cols-2">
                {hits.map(({ item, hit }) => (
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

          {nothingFound ? (
            <div className="space-y-3 rounded-2xl border border-dashed p-6 text-center">
              <p className="text-sm text-muted-foreground">
                Aucune fiche « {scopeLabel} » ne contient « {query.trim()} ».
              </p>
              {outsideCatalogButton(true)}
              <p className="text-xs text-muted-foreground">La fiche rédigée sera marquée « non vérifiée ».</p>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3 border-t pt-4 text-sm text-muted-foreground">
              <span>Pas la bonne fiche ?</span>
              {outsideCatalogButton(false)}
            </div>
          )}
        </div>
      ) : (
        /* Liste du métier affiché */
        <div className="space-y-8">
          <section className="space-y-3">
            <h2 className="font-display text-xl font-semibold">
              {scope.kind === "family" ? scopeLabel : tradeLabel ? `Fiches ${tradeLabel}` : "Mes fiches"}
              {inScope.length > 0 ? <span className="ml-2 text-base font-normal text-muted-foreground">{inScope.length}</span> : null}
            </h2>
            {inScope.length > 0 ? (
              <ul className="grid gap-3 md:grid-cols-2">
                {inScope.map((sheet) => (
                  <SheetCard key={sheet.id} sheet={sheet} terms={[]} />
                ))}
              </ul>
            ) : (
              <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                {scope.kind === "family" ? (
                  "Pas encore de fiche pour ce métier."
                ) : tradeLabel ? (
                  "Pas encore de fiche relue pour ton métier : elles arrivent. En attendant, consulte les autres métiers ou demande une fiche à l'IA."
                ) : (
                  <>
                    Renseigne ton métier dans{" "}
                    <Link href="/app/reglages?tab=activite" className="font-medium text-primary underline-offset-4 hover:underline">
                      Mon activité
                    </Link>{" "}
                    pour voir tes fiches, ou consulte les autres métiers.
                  </>
                )}
              </p>
            )}
          </section>

          {scope.kind === "mine" && aiSheets.length > 0 ? (
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
