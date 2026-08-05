"use client";

import * as React from "react";
import { Loader2, MapPin } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { searchBanAddresses, type BanSuggestion } from "@/lib/geo/ban";
import { cn } from "@/lib/utils";

/**
 * Champ d'adresse avec autocomplétion BAN. Choisir une suggestion remplit
 * l'adresse, le code postal et la ville, et fige les coordonnées dans des
 * champs cachés (latitude/longitude) soumis avec le formulaire.
 *
 * Non contrôlé au sens strict : les états locaux alimentent les inputs, mais les
 * valeurs partent via `name=` dans le FormData du formulaire parent.
 */
export function AddressAutocomplete({
  initialAddressLine1,
  initialPostalCode,
  initialCity,
  initialLatitude,
  initialLongitude,
}: {
  initialAddressLine1: string | null;
  initialPostalCode: string | null;
  initialCity: string | null;
  initialLatitude: number | null;
  initialLongitude: number | null;
}) {
  const [addressLine1, setAddressLine1] = React.useState(initialAddressLine1 ?? "");
  const [postalCode, setPostalCode] = React.useState(initialPostalCode ?? "");
  const [city, setCity] = React.useState(initialCity ?? "");
  const [lat, setLat] = React.useState<number | null>(initialLatitude);
  const [lng, setLng] = React.useState<number | null>(initialLongitude);

  const [suggestions, setSuggestions] = React.useState<BanSuggestion[]>([]);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(-1);

  const abortRef = React.useRef<AbortController | null>(null);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const justSelectedRef = React.useRef(false);

  React.useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function onAddressChange(value: string) {
    setAddressLine1(value);
    // Toute frappe invalide les coordonnées figées : elles seront reposées au géocodage serveur si besoin.
    setLat(null);
    setLng(null);

    if (justSelectedRef.current) {
      justSelectedRef.current = false;
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      const results = await searchBanAddresses(value, { limit: 5, signal: controller.signal });
      setLoading(false);
      setSuggestions(results);
      setActiveIndex(-1);
      setOpen(results.length > 0);
    }, 250);
  }

  function selectSuggestion(s: BanSuggestion) {
    justSelectedRef.current = true;
    setAddressLine1(s.addressLine1);
    setPostalCode(s.postalCode);
    setCity(s.city);
    setLat(s.latitude);
    setLng(s.longitude);
    setSuggestions([]);
    setOpen(false);
    setActiveIndex(-1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {/* Coordonnées transmises au serveur ; vides si l'adresse n'a pas été géocodée. */}
      <input type="hidden" name="latitude" value={lat ?? ""} />
      <input type="hidden" name="longitude" value={lng ?? ""} />

      <div className="relative space-y-2 sm:col-span-2">
        <Label htmlFor="address_line1">Adresse</Label>
        <div className="relative">
          <MapPin className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="address_line1"
            name="address_line1"
            value={addressLine1}
            onChange={(e) => onAddressChange(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => suggestions.length > 0 && setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder="Commence à taper : 12 rue des Artisans…"
            autoComplete="off"
            className="pl-9"
            aria-autocomplete="list"
            aria-expanded={open}
          />
          {loading && (
            <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>

        {open && suggestions.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border bg-popover shadow-md">
            {suggestions.map((s, i) => (
              <li key={`${s.label}-${i}`}>
                <button
                  type="button"
                  // onMouseDown : se déclenche avant le blur de l'input, sinon la liste se ferme d'abord.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectSuggestion(s);
                  }}
                  className={cn(
                    "flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition-colors",
                    i === activeIndex ? "bg-muted" : "hover:bg-muted/60",
                  )}
                >
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span>{s.label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          Choisis une adresse proposée pour être visible dans la recherche des clients.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="postal_code">Code postal</Label>
        <Input
          id="postal_code"
          name="postal_code"
          value={postalCode}
          onChange={(e) => setPostalCode(e.target.value)}
          placeholder="75001"
          autoComplete="postal-code"
          inputMode="numeric"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="city">Ville</Label>
        <Input
          id="city"
          name="city"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="Paris"
          autoComplete="address-level2"
        />
      </div>
    </div>
  );
}
