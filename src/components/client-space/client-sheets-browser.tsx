"use client";

import { ArrowRight, Lightbulb, Loader2, Search, Sparkles, X } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { searchClientSheetsAction } from "@/app/compte/assistance-actions";
import { Input } from "@/components/ui/input";
import { highlightParts, matchSheetText, searchTerms } from "@/lib/technical-sheets/sheet-search";
import { CLIENT_LEVEL_LABEL, CLIENT_SHEET_DOMAINS, type ClientSheetDomain, type ClientSheetLevel } from "@/lib/technical-sheets/client/types";
import { cn } from "@/lib/utils";

export type ClientSheetItem = {
  id: string;
  title: string;
  summary: string;
  domain: ClientSheetDomain;
  level: ClientSheetLevel;
  segments: string[];
};

type SmartState = { status: "loading" } | { status: "done"; matches: { id: string; reason: string }[] } | { status: "error" };

function Highlighted({ text, terms }: { text: string; terms: string[] }) {
  return (
    <>
      {highlightParts(text, terms).map((part, i) =>
        part.match ? (
          <mark key={i} className="rounded-sm bg-warning/30 px-0.5 text-foreground">
            {part.text}
          </mark>
        ) : (
          <React.Fragment key={i}>{part.text}</React.Fragment>
        ),
      )}
    </>
  );
}

function LevelBadge({ level }: { level: ClientSheetLevel }) {
  return (
    <span
      className={cn(
        "inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold",
        level === "urgence" ? "bg-destructive/10 text-destructive" : level === "facile" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground",
      )}
    >
      {CLIENT_LEVEL_LABEL[level]}
    </span>
  );
}

function SheetCard({ sheet, terms = [], note }: { sheet: ClientSheetItem; terms?: string[]; note?: React.ReactNode }) {
  return (
    <li>
      <Link
        href={`/compte/depannage/${sheet.id}`}
        className="group flex h-full items-start gap-3 rounded-2xl border bg-card p-4 shadow-sm transition-colors hover:border-primary/40"
      >
        <div className="min-w-0 flex-1 space-y-1.5">
          <LevelBadge level={sheet.level} />
          <p className="font-semibold leading-snug">
            <Highlighted text={sheet.title} terms={terms} />
          </p>
          {note ?? <p className="line-clamp-2 text-sm text-muted-foreground">{sheet.summary}</p>}
        </div>
        <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
      </Link>
    </li>
  );
}

export function ClientSheetsBrowser({ sheets }: { sheets: ClientSheetItem[] }) {
  const [query, setQuery] = React.useState("");
  const [domain, setDomain] = React.useState<ClientSheetDomain | null>(null);
  const [smart, setSmart] = React.useState<Record<string, SmartState>>({});

  const terms = searchTerms(query);
  const searching = terms.length > 0;
  const key = query.trim().toLowerCase();
  const smartState = smart[key];
  const wantsSmart = key.length >= 4;

  React.useEffect(() => {
    if (!wantsSmart || smart[key]) return;
    const timer = window.setTimeout(async () => {
      setSmart((prev) => ({ ...prev, [key]: { status: "loading" } }));
      const res = await searchClientSheetsAction(key);
      setSmart((prev) => ({ ...prev, [key]: res.ok ? { status: "done", matches: res.matches } : { status: "error" } }));
    }, 700);
    return () => window.clearTimeout(timer);
  }, [wantsSmart, key, smart]);

  const byId = new Map(sheets.map((s) => [s.id, s]));
  const smartMatches =
    smartState?.status === "done"
      ? smartState.matches.flatMap((m) => (byId.get(m.id) ? [{ sheet: byId.get(m.id)!, reason: m.reason }] : []))
      : [];
  const smartIds = new Set(smartMatches.map((m) => m.sheet.id));
  const keywordHits = searching
    ? sheets
        .flatMap((s) => {
          const hit = matchSheetText(s.title, s.segments, terms);
          return hit && !smartIds.has(s.id) ? [{ sheet: s, hit }] : [];
        })
        .sort((a, b) => b.hit.score - a.hit.score)
    : [];
  const smartPending = wantsSmart && (!smartState || smartState.status === "loading");
  const nothing = searching && !smartPending && smartMatches.length + keywordHits.length === 0;

  const urgences = sheets.filter((s) => s.level === "urgence");
  const visible = domain ? sheets.filter((s) => s.domain === domain) : sheets;

  return (
    <div className="space-y-6">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Décrivez votre souci : l'eau ne s'évacue plus, ça sent le gaz…"
          className="h-12 pr-9 pl-9 text-base"
          aria-label="Rechercher une fiche dépannage"
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
        <div className="space-y-5">
          {smartPending ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Je cherche les fiches qui correspondent…
            </p>
          ) : null}
          {smartMatches.length > 0 ? (
            <section className="space-y-3">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                <Lightbulb className="size-4 text-primary" aria-hidden /> Correspond à votre souci
              </h2>
              <ul className="grid gap-3 md:grid-cols-2">
                {smartMatches.map(({ sheet, reason }) => (
                  <SheetCard key={sheet.id} sheet={sheet} note={reason ? <p className="text-sm text-foreground/80">{reason}</p> : undefined} />
                ))}
              </ul>
            </section>
          ) : null}
          {keywordHits.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">
                {smartMatches.length > 0 ? "Contient aussi les mots cherchés" : "Fiches qui contiennent ces mots"}
              </h2>
              <ul className="grid gap-3 md:grid-cols-2">
                {keywordHits.map(({ sheet, hit }) => (
                  <SheetCard
                    key={sheet.id}
                    sheet={sheet}
                    terms={terms}
                    note={
                      hit.excerpt ? (
                        <p className="line-clamp-2 text-sm text-muted-foreground">
                          … <Highlighted text={hit.excerpt} terms={terms} /> …
                        </p>
                      ) : undefined
                    }
                  />
                ))}
              </ul>
            </section>
          ) : null}
          {!smartPending ? (
            <div className={cn("rounded-2xl border p-4 text-sm", nothing ? "border-dashed text-center" : "bg-card")}>
              {nothing ? <p className="mb-3 text-muted-foreground">Pas de fiche pour « {query.trim()} ».</p> : null}
              <Link
                href={`/compte/assistant?q=${encodeURIComponent(query.trim())}`}
                className="inline-flex items-center gap-2 font-medium text-primary underline-offset-4 hover:underline"
              >
                <Sparkles className="size-4" aria-hidden /> Expliquer mon souci à l&apos;assistant
              </Link>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-8">
          <section className="space-y-3">
            <h2 className="font-display text-xl font-semibold text-destructive">En cas d&apos;urgence</h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {urgences.map((s) => (
                <SheetCard key={s.id} sheet={s} />
              ))}
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-xl font-semibold">Toutes les fiches</h2>
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
              <button
                type="button"
                onClick={() => setDomain(null)}
                className={cn("shrink-0 rounded-full border px-3 py-1.5 text-sm", !domain ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}
              >
                Toutes
              </button>
              {CLIENT_SHEET_DOMAINS.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDomain(d.id)}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1.5 text-sm",
                    domain === d.id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
                  )}
                >
                  <span aria-hidden>{d.emoji}</span> {d.label}
                </button>
              ))}
            </div>
            <ul className="grid gap-3 md:grid-cols-2">
              {visible.map((s) => (
                <SheetCard key={s.id} sheet={s} />
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
