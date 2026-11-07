"use client";

import { CheckCircle2, HardHat, Loader2, MapPin, MessageSquare, Navigation, Send } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { requestArtisanConnection, type ConnectionResult } from "@/app/compte/assistance-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { reverseBanCoordinates, searchBanAddresses, type BanSuggestion } from "@/lib/geo/ban";
import { findTrade, TRADE_CATEGORIES } from "@/lib/trades/taxonomy";
import { cn } from "@/lib/utils";

export type ConnectionDefaults = {
  firstName: string;
  lastName: string;
  phone: string;
  addressLabel: string;
  lat: number | null;
  lng: number | null;
};

type Trade = { categoryId: string; tradeId: string };

const selectClass =
  "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const euros = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

/** Saisie d'adresse : suggestions de la Base Adresse Nationale ou position du téléphone. */
function AddressField({
  value,
  onChange,
}: {
  value: { label: string; lat: number | null; lng: number | null };
  onChange: (next: { label: string; lat: number | null; lng: number | null }) => void;
}) {
  const [suggestions, setSuggestions] = React.useState<BanSuggestion[]>([]);
  const [locating, setLocating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (value.lat != null || value.label.trim().length < 4) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        setSuggestions(await searchBanAddresses(value.label, { limit: 5, signal: controller.signal }));
      } catch {
        /* frappe en cours : requête annulée */
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [value.label, value.lat]);

  function locate() {
    if (!navigator.geolocation) {
      setError("La localisation n'est pas disponible sur cet appareil.");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const found = await reverseBanCoordinates(latitude, longitude).catch(() => null);
        onChange({ label: found?.label ?? "Ma position actuelle", lat: latitude, lng: longitude });
        setSuggestions([]);
        setLocating(false);
      },
      () => {
        setError("Localisation refusée : saisissez l'adresse.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <MapPin className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            id="connect-address"
            value={value.label}
            onChange={(event) => onChange({ label: event.target.value, lat: null, lng: null })}
            placeholder="Adresse de l'intervention"
            className="pl-9"
            autoComplete="street-address"
          />
          {suggestions.length > 0 && value.lat == null ? (
            <ul className="absolute top-full right-0 left-0 z-20 mt-1 overflow-hidden rounded-xl border bg-popover shadow-lg">
              {suggestions.map((s) => (
                <li key={`${s.label}-${s.latitude}`}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => {
                      onChange({ label: s.label, lat: s.latitude, lng: s.longitude });
                      setSuggestions([]);
                    }}
                  >
                    {s.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <Button type="button" variant="outline" onClick={locate} disabled={locating} aria-label="Utiliser ma position">
          {locating ? <Loader2 className="animate-spin" aria-hidden /> : <Navigation aria-hidden />}
          <span className="hidden sm:inline">Ma position</span>
        </Button>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {value.label && value.lat == null && suggestions.length === 0 && value.label.trim().length >= 4 ? (
        <p className="text-xs text-muted-foreground">Choisissez une adresse dans la liste pour trouver les artisans proches.</p>
      ) : null}
    </div>
  );
}

/**
 * Mise en relation avec les artisans du coin : la demande (métier, description, adresse)
 * part aux 3 artisans les plus proches, qui répondent dans « Messages ».
 */
export function ConnectArtisanPanel({
  defaults,
  initialTrade,
  initialDescription = "",
  className,
}: {
  defaults: ConnectionDefaults | null;
  initialTrade: Trade | null;
  initialDescription?: string;
  className?: string;
}) {
  const [trade, setTrade] = React.useState<Trade | null>(initialTrade);
  const [description, setDescription] = React.useState(initialDescription);
  const [address, setAddress] = React.useState({
    label: defaults?.addressLabel ?? "",
    lat: defaults?.lat ?? null,
    lng: defaults?.lng ?? null,
  });
  const [firstName, setFirstName] = React.useState(defaults?.firstName ?? "");
  const [lastName, setLastName] = React.useState(defaults?.lastName ?? "");
  const [phone, setPhone] = React.useState(defaults?.phone ?? "");
  const [remember, setRemember] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<Extract<ConnectionResult, { ok: true }> | null>(null);
  const [pending, startTransition] = React.useTransition();

  const tradeLabel = trade ? findTrade(trade.categoryId, trade.tradeId)?.label ?? null : null;

  if (result) {
    return (
      <div className={cn("space-y-4 rounded-2xl border border-success/40 bg-success/5 p-5", className)}>
        <div className="flex gap-3">
          <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-success" aria-hidden />
          <div className="space-y-1">
            <p className="font-semibold">Votre demande est envoyée</p>
            <p className="text-sm text-muted-foreground">
              {result.artisans.length > 0
                ? `${result.artisans.length} artisan${result.artisans.length > 1 ? "s" : ""} près de chez vous ${
                    result.artisans.length > 1 ? "l'ont reçue" : "l'a reçue"
                  }. Ils vous répondent dans vos messages.`
                : "Nous n'avons pas encore d'artisan inscrit de ce métier près de chez vous : notre équipe contacte les professionnels de votre zone et revient vers vous."}
            </p>
          </div>
        </div>
        {result.artisans.length > 0 ? (
          <ul className="space-y-2">
            {result.artisans.map((a) => (
              <li key={a.id} className="flex items-center gap-3 rounded-xl border bg-card p-3">
                {a.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.logoUrl} alt="" className="size-10 rounded-lg border object-cover" />
                ) : (
                  <span className="flex size-10 items-center justify-center rounded-lg bg-muted">
                    <HardHat className="size-5 text-muted-foreground" aria-hidden />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{a.businessName}</span>
                  <span className="block text-xs text-muted-foreground">
                    {[a.city, a.distanceKm != null ? `${a.distanceKm.toLocaleString("fr-FR")} km` : null].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {a.slug ? (
                  <Link href={`/site/${a.slug}`} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                    Voir
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {result.estimate ? (
          <p className="text-sm">
            Estimation indicative : <strong>{euros.format(result.estimate.min)} – {euros.format(result.estimate.max)}</strong>, à
            confirmer par le devis de l&apos;artisan.
          </p>
        ) : null}
        <Link
          href="/compte/messages"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          <MessageSquare className="size-4" aria-hidden /> Mes messages
        </Link>
      </div>
    );
  }

  return (
    <form
      className={cn("space-y-4 rounded-2xl border bg-card p-4 shadow-sm sm:p-5", className)}
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        if (!trade) return setError("Choisissez le métier du professionnel recherché.");
        if (address.lat == null || address.lng == null) return setError("Choisissez l'adresse de l'intervention dans la liste.");
        startTransition(async () => {
          const res = await requestArtisanConnection({
            description,
            categoryId: trade.categoryId,
            tradeId: trade.tradeId,
            firstName,
            lastName,
            phone,
            addressLabel: address.label,
            lat: address.lat!,
            lng: address.lng!,
            remember,
          });
          if (!res.ok) setError(res.message);
          else setResult(res);
        });
      }}
    >
      <div className="space-y-1">
        <h3 className="font-display text-lg font-semibold">
          {tradeLabel ? `Trouver un ${tradeLabel.toLowerCase()} près de chez vous` : "Trouver un artisan près de chez vous"}
        </h3>
        <p className="text-sm text-muted-foreground">
          Votre demande part aux artisans les plus proches. Gratuit et sans engagement : ils vous répondent dans vos messages.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="connect-trade">Métier</Label>
        <select
          id="connect-trade"
          className={selectClass}
          value={trade ? `${trade.categoryId}/${trade.tradeId}` : ""}
          onChange={(event) => {
            const [categoryId, tradeId] = event.target.value.split("/");
            setTrade(categoryId && tradeId ? { categoryId, tradeId } : null);
          }}
        >
          <option value="">Choisir un métier…</option>
          {TRADE_CATEGORIES.filter((c) => c.id !== "autre").map((category) => (
            <optgroup key={category.id} label={category.label}>
              {category.trades.map((t) => (
                <option key={t.id} value={`${category.id}/${t.id}`}>
                  {t.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="connect-description">Votre demande</Label>
        <Textarea
          id="connect-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Décrivez le problème : où, depuis quand, ce que vous avez déjà fait…"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="connect-address">Adresse de l&apos;intervention</Label>
        <AddressField value={address} onChange={setAddress} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="connect-first-name">Prénom</Label>
          <Input id="connect-first-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="connect-last-name">Nom</Label>
          <Input id="connect-last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="connect-phone">Téléphone</Label>
          <Input id="connect-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="size-4 rounded" />
        Garder mon adresse et mon téléphone pour mes prochaines demandes
      </label>

      {error ? <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}

      <Button type="submit" size="lg" disabled={pending} className="w-full sm:w-auto">
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
        {pending ? "Recherche des artisans (quelques secondes)…" : "Envoyer ma demande aux artisans du coin"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Vos coordonnées sont transmises uniquement aux artisans qui reçoivent cette demande.
      </p>
    </form>
  );
}
