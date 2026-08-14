"use client";

import * as React from "react";
import { Loader2, MapPin, Navigation } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StepShell } from "@/components/trades/trade-picker";
import { searchBanAddresses, type BanSuggestion } from "@/lib/geo/ban";

export type LeadLocation = { lat: number; lng: number; label: string };

export function LocationStep({
  onBack,
  onDone,
}: {
  onBack: () => void;
  onDone: (location: LeadLocation) => void;
}) {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<BanSuggestion[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [locating, setLocating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
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
    setError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 3) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setSearching(true);
      const found = await searchBanAddresses(value, { limit: 6, signal: controller.signal });
      setSearching(false);
      setResults(found);
    }, 250);
  }

  function geolocate() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Ton navigateur ne gère pas la géolocalisation. Saisis ton adresse.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onDone({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          label: "Ma position actuelle",
        });
      },
      () => {
        setLocating(false);
        setError("Géolocalisation refusée. Saisis ton adresse ou ta ville.");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }

  return (
    <StepShell
      title="Où se déroulent les travaux ?"
      subtitle="Pour te proposer des artisans réellement proches"
      onBack={onBack}
    >
      <Button
        type="button"
        size="lg"
        className="w-full gap-2"
        onClick={geolocate}
        disabled={locating}
      >
        {locating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Navigation className="h-5 w-5" />}
        Utiliser ma position
      </Button>

      <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        ou
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="relative">
        <MapPin className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Adresse ou ville — ex. 12 rue de la Paix, Lyon"
          className="pl-9"
          autoComplete="street-address"
        />
        {searching && (
          <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {results.length > 0 && (
        <ul className="divide-y overflow-hidden rounded-xl border">
          {results.map((r, i) => (
            <li key={`${r.label}-${i}`}>
              <button
                type="button"
                onClick={() => onDone({ lat: r.latitude, lng: r.longitude, label: r.label })}
                className="flex w-full items-center gap-2 px-3 py-3 text-left text-sm transition-colors hover:bg-muted"
              >
                <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        Ton adresse exacte n’est transmise qu’à l’artisan que tu contactes.
      </p>
    </StepShell>
  );
}
