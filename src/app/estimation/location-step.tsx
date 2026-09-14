"use client";

import * as React from "react";
import { Loader2, MapPin, Navigation } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StepShell } from "@/components/trades/trade-picker";
import { useIsSmartphone } from "@/lib/device/use-is-smartphone";
import { reverseBanCoordinates, searchBanAddresses, type BanSuggestion } from "@/lib/geo/ban";

export type LeadLocation = { lat: number; lng: number; label: string };

export function LocationStep({
  onBack,
  onDone,
}: {
  onBack: () => void;
  onDone: (location: LeadLocation) => void | Promise<void>;
}) {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<BanSuggestion[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [locating, setLocating] = React.useState(false);
  const [locatingLabel, setLocatingLabel] = React.useState("Localisation en cours…");
  const [error, setError] = React.useState<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const isSmartphone = useIsSmartphone();

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

  async function pickLocation(location: LeadLocation) {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onDone(location);
    } finally {
      setSubmitting(false);
    }
  }

  function geolocate() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Ton navigateur ne gère pas la géolocalisation. Saisis ton adresse.");
      return;
    }
    if (submitting) return;

    setLocating(true);
    setLocatingLabel("Localisation en cours…");
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void (async () => {
          const { latitude, longitude } = pos.coords;
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            setLocating(false);
            setError("Position GPS invalide. Saisis ton adresse à la main.");
            return;
          }

          setLocatingLabel("Recherche de ton adresse…");
          abortRef.current?.abort();
          const controller = new AbortController();
          abortRef.current = controller;

          const reversed = await reverseBanCoordinates(latitude, longitude, {
            signal: controller.signal,
          });
          setLocating(false);

          if (!reversed) {
            setError(
              "Impossible de relier ta position à une adresse en France. Saisis ton adresse ou ta ville.",
            );
            return;
          }

          await pickLocation({
            lat: reversed.latitude,
            lng: reversed.longitude,
            label: reversed.label,
          });
        })();
      },
      () => {
        setLocating(false);
        setError("Géolocalisation refusée. Saisis ton adresse ou ta ville.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  return (
    <StepShell
      title="Où se déroulent les travaux ?"
      subtitle="Pour te proposer des artisans réellement proches"
      onBack={onBack}
    >
      {isSmartphone ? (
        <>
          <Button
            type="button"
            size="lg"
            className="w-full gap-2"
            onClick={geolocate}
            disabled={locating || submitting}
          >
            {locating ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Navigation className="h-5 w-5" />
            )}
            Utiliser ma position
          </Button>
          {locating ? (
            <p className="text-center text-sm text-muted-foreground">{locatingLabel}</p>
          ) : null}

          <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            ou
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      ) : null}

      <div className="relative">
        <MapPin className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Adresse ou ville — ex. 12 rue de la Paix, Lyon"
          className="pl-9"
          autoComplete="street-address"
          disabled={locating || submitting}
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
                onClick={() =>
                  void pickLocation({ lat: r.latitude, lng: r.longitude, label: r.label })
                }
                disabled={locating || submitting}
                className="flex w-full items-center gap-2 px-3 py-3 text-left text-sm transition-colors hover:bg-muted disabled:opacity-60"
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
