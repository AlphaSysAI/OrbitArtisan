"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronLeft, Loader2, MapPin, Navigation, Search, Store } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button-variants";
import { searchBanCities, type BanSuggestion } from "@/lib/geo/ban";
import {
  TRADE_DOMAINS,
  categoriesForDomain,
  findTradeDomain,
  findTradeCategory,
  type TradeCategory,
} from "@/lib/trades/taxonomy";
import { cn } from "@/lib/utils";

import { searchArtisansNearby, type NearbyArtisan } from "./actions";

type Origin = { lat: number; lng: number; label: string };

// Étapes du parcours guidé.
type Step =
  | { name: "start" }
  | { name: "locating" }
  | { name: "manual-location" }
  | { name: "domain"; origin: Origin }
  | { name: "category"; origin: Origin; domainId: string }
  | { name: "trade"; origin: Origin; domainId: string; category: TradeCategory }
  | { name: "results"; origin: Origin; categoryId: string; tradeId: string; tradeLabel: string };

export function RechercheClient() {
  const [step, setStep] = React.useState<Step>({ name: "start" });

  function startGeolocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStep({ name: "manual-location" });
      return;
    }
    setStep({ name: "locating" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setStep({
          name: "domain",
          origin: { lat: pos.coords.latitude, lng: pos.coords.longitude, label: "Ta position actuelle" },
        });
      },
      () => {
        // Refus ou échec : on bascule sur la saisie manuelle.
        toast.message("Géolocalisation indisponible", {
          description: "Indique ta ville pour chercher autour de toi.",
        });
        setStep({ name: "manual-location" });
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }

  return (
    <div className="space-y-6">
      {step.name === "start" && (
        <StartButton onGeolocate={startGeolocation} onManual={() => setStep({ name: "manual-location" })} />
      )}

      {step.name === "locating" && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border bg-card py-16 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Localisation en cours…</p>
        </div>
      )}

      {step.name === "manual-location" && (
        <ManualLocation
          onPick={(o) => setStep({ name: "domain", origin: o })}
          onBack={() => setStep({ name: "start" })}
        />
      )}

      {step.name === "domain" && (
        <StepShell
          title="Quel type d’artisan cherches-tu ?"
          subtitle={step.origin.label}
          onBack={() => setStep({ name: "start" })}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {TRADE_DOMAINS.map((d) => (
              <ChoiceButton
                key={d.id}
                emoji={d.emoji}
                label={d.label}
                onClick={() => setStep({ name: "category", origin: step.origin, domainId: d.id })}
              />
            ))}
          </div>
        </StepShell>
      )}

      {step.name === "category" && (
        <StepShell
          title={findTradeDomain(step.domainId)?.label ?? "Choisis une spécialité"}
          subtitle="Précise la spécialité"
          onBack={() => setStep({ name: "domain", origin: step.origin })}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {categoriesForDomain(step.domainId).map((c) => (
              <ChoiceButton
                key={c.id}
                label={c.label}
                onClick={() =>
                  setStep({ name: "trade", origin: step.origin, domainId: step.domainId, category: c })
                }
              />
            ))}
          </div>
        </StepShell>
      )}

      {step.name === "trade" && (
        <StepShell
          title={step.category.label}
          subtitle="Choisis le métier exact"
          onBack={() => setStep({ name: "category", origin: step.origin, domainId: step.domainId })}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {step.category.trades.map((t) => (
              <ChoiceButton
                key={t.id}
                label={t.label}
                onClick={() =>
                  setStep({
                    name: "results",
                    origin: step.origin,
                    categoryId: step.category.id,
                    tradeId: t.id,
                    tradeLabel: t.label,
                  })
                }
              />
            ))}
          </div>
        </StepShell>
      )}

      {step.name === "results" && (
        <Results
          origin={step.origin}
          categoryId={step.categoryId}
          tradeId={step.tradeId}
          tradeLabel={step.tradeLabel}
          onBack={() =>
            setStep({
              name: "trade",
              origin: step.origin,
              domainId: findTradeDomain(TRADE_DOMAINS.find((d) => d.categoryIds.includes(step.categoryId))?.id)?.id ?? "",
              category: findTradeCategory(step.categoryId)!,
            })
          }
          onRestart={() => setStep({ name: "domain", origin: step.origin })}
        />
      )}
    </div>
  );
}

function StartButton({ onGeolocate, onManual }: { onGeolocate: () => void; onManual: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border bg-card px-6 py-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <Navigation className="h-8 w-8 text-primary" />
      </div>
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Trouve un artisan près de chez toi</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          On te guide pas à pas jusqu’au bon professionnel.
        </p>
      </div>
      <Button size="lg" className="h-12 gap-2 text-base" onClick={onGeolocate}>
        <Navigation className="h-5 w-5" />
        Rechercher un artisan autour de moi
      </Button>
      <button
        type="button"
        onClick={onManual}
        className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        Saisir ma ville à la place
      </button>
    </div>
  );
}

function ManualLocation({ onPick, onBack }: { onPick: (o: Origin) => void; onBack: () => void }) {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<BanSuggestion[]>([]);
  const [loading, setLoading] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function onChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      const found = await searchBanCities(value, { limit: 6, signal: controller.signal });
      setLoading(false);
      setResults(found);
    }, 250);
  }

  return (
    <StepShell title="Indique ta ville" subtitle="On cherchera les artisans autour" onBack={onBack}>
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Ex. Lyon, ou 69003"
          className="pl-9"
          autoFocus
        />
        {loading && (
          <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>
      {results.length > 0 && (
        <ul className="mt-3 divide-y overflow-hidden rounded-lg border">
          {results.map((c, i) => (
            <li key={`${c.label}-${i}`}>
              <button
                type="button"
                onClick={() => onPick({ lat: c.latitude, lng: c.longitude, label: c.label })}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted"
              >
                <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                {c.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </StepShell>
  );
}

function Results({
  origin,
  categoryId,
  tradeId,
  tradeLabel,
  onBack,
  onRestart,
}: {
  origin: Origin;
  categoryId: string;
  tradeId: string;
  tradeLabel: string;
  onBack: () => void;
  onRestart: () => void;
}) {
  const [state, setState] = React.useState<
    { status: "loading" } | { status: "error" } | { status: "done"; artisans: NearbyArtisan[] }
  >({ status: "loading" });

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await searchArtisansNearby({ lat: origin.lat, lng: origin.lng, categoryId, tradeId });
      if (cancelled) return;
      if (!res.ok) setState({ status: "error" });
      else setState({ status: "done", artisans: res.artisans });
    })();
    return () => {
      cancelled = true;
    };
  }, [origin.lat, origin.lng, categoryId, tradeId]);

  return (
    <StepShell title={tradeLabel} subtitle={`Autour de ${origin.label}`} onBack={onBack}>
      {state.status === "loading" && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Recherche des artisans…</p>
        </div>
      )}

      {state.status === "error" && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          La recherche a échoué. Réessaie dans un instant.
        </p>
      )}

      {state.status === "done" && state.artisans.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <Store className="h-10 w-10 text-muted-foreground/50" />
          <p className="max-w-sm text-sm text-muted-foreground">
            Aucun <span className="font-medium text-foreground">{tradeLabel.toLowerCase()}</span> trouvé dans un
            rayon de 50 km. Essaie un métier proche ou une autre localisation.
          </p>
          <Button variant="outline" size="sm" onClick={onRestart}>
            Changer de métier
          </Button>
        </div>
      )}

      {state.status === "done" && state.artisans.length > 0 && (
        <ul className="space-y-3">
          {state.artisans.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{a.business_name}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  {a.city ?? "—"}
                  <span className="text-foreground">· à {a.distance_km} km</span>
                </p>
              </div>
              <Link
                href={`/site/${a.slug}`}
                className={cn(buttonVariants({ size: "sm" }), "shrink-0 gap-1.5")}
              >
                <Store className="h-4 w-4" />
                Voir la vitrine
              </Link>
            </li>
          ))}
        </ul>
      )}
    </StepShell>
  );
}

function StepShell({
  title,
  subtitle,
  onBack,
  children,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onBack} aria-label="Retour">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {subtitle && (
            <p className="flex items-center gap-1 text-sm text-muted-foreground">
              <Search className="h-3.5 w-3.5" />
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

function ChoiceButton({ emoji, label, onClick }: { emoji?: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-xl border bg-card px-4 py-4 text-left text-sm font-medium transition-all",
        "hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      )}
    >
      {emoji && <span className="text-xl">{emoji}</span>}
      <span>{label}</span>
    </button>
  );
}
