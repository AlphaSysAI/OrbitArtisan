"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { VITRINE_DEFAULT_ACCENT } from "@/lib/vitrine-theme";

import { upsertProfile } from "./actions";

const ACCENT_PRESETS: { label: string; hex: string }[] = [
  { label: "Bleu travaux", hex: "#0284c7" },
  { label: "Ambre chaleur", hex: "#ea580c" },
  { label: "Vert nature", hex: "#16a34a" },
  { label: "Violet créatif", hex: "#7c3aed" },
  { label: "Ardoise", hex: "#475569" },
];

export function ProfileForm({
  initialValues,
}: {
  initialValues: {
    name: string | null;
    business_name: string;
    description: string | null;
    logo_url: string | null;
    slug: string;
    accent_color: string | null;
    labor_rate_per_hour: number | null;
  };
}) {
  const [slug, setSlug] = React.useState(initialValues.slug ?? "");
  const [accentMode, setAccentMode] = React.useState<"auto" | "custom">(
    initialValues.accent_color ? "custom" : "auto",
  );
  const [accentHex, setAccentHex] = React.useState(
    initialValues.accent_color ?? VITRINE_DEFAULT_ACCENT,
  );

  // Stocké en centimes côté DB (ex: 4500 => 45,00€ / h).
  const [laborRateEur, setLaborRateEur] = React.useState(() => {
    if (initialValues.labor_rate_per_hour == null) return "";
    return String(initialValues.labor_rate_per_hour / 100).replace(".", ",");
  });

  async function onSubmit(formData: FormData) {
    const res = await upsertProfile(formData);
    if (!res.ok) {
      toast.error(
        res.error === "missing_fields"
          ? "Nom d’activité et adresse web sont obligatoires."
          : res.error === "invalid_slug"
            ? "Adresse web invalide (lettres minuscules, chiffres, tirets)."
            :         res.error === "slug_taken"
              ? "Cette adresse est déjà utilisée."
              : res.error === "invalid_accent"
                ? "Couleur invalide (format #RRGGBB)."
                : "Impossible d’enregistrer. Réessaie.",
      );
      return;
    }
    toast.success("Enregistré.");
  }

  return (
    <form action={onSubmit} className="space-y-8 rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
      <div className="space-y-2">
        <Label htmlFor="business_name" className="text-base">
          Nom de ton activité <span className="text-destructive">*</span>
        </Label>
        <Input
          id="business_name"
          name="business_name"
          className="h-11 text-base"
          defaultValue={initialValues.business_name}
          placeholder="Ex. Plomberie Martin"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="slug" className="text-base">
          Adresse de ta page <span className="text-destructive">*</span>
        </Label>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">…/site/</span>
          <Input
            id="slug"
            name="slug"
            className="h-11 max-w-xs flex-1 font-mono text-base"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="plomberie-martin"
            required
          />
        </div>
        <p className="text-xs text-muted-foreground">Sans accents ni espaces.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="name" className="text-base">
          Ton nom <span className="font-normal text-muted-foreground">(facultatif)</span>
        </Label>
        <Input
          id="name"
          name="name"
          className="h-11 text-base"
          defaultValue={initialValues.name ?? ""}
          placeholder="Jean Martin"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description" className="text-base">
          Présentation <span className="font-normal text-muted-foreground">(facultatif)</span>
        </Label>
        <Textarea
          id="description"
          name="description"
          className="min-h-[120px] resize-y text-base"
          defaultValue={initialValues.description ?? ""}
          placeholder="Quelques lignes sur ton savoir-faire et ta zone d’intervention."
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="logo_url" className="text-base">
          Logo <span className="font-normal text-muted-foreground">(lien image, facultatif)</span>
        </Label>
        <Input
          id="logo_url"
          name="logo_url"
          className="h-11 text-base"
          type="url"
          defaultValue={initialValues.logo_url ?? ""}
          placeholder="https://…"
        />
      </div>

      <div className="space-y-4 rounded-2xl border border-dashed bg-muted/30 p-5">
        <div>
          <Label className="text-base">Couleur de ta page vitrine</Label>
          <p className="mt-1 text-sm text-muted-foreground">
            Une couleur dominante pour les boutons et l’en-tête. Sinon, on la déduit du type de métier dans ton nom
            d’activité (plomberie, électricité…).
          </p>
        </div>

        <input type="hidden" name="accent_color" value={accentMode === "auto" ? "" : accentHex} />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setAccentMode("auto")}
            className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
              accentMode === "auto"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background hover:bg-muted"
            }`}
          >
            Automatique (métier)
          </button>
          <button
            type="button"
            onClick={() => {
              setAccentMode("custom");
              if (!accentHex.startsWith("#")) setAccentHex(VITRINE_DEFAULT_ACCENT);
            }}
            className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
              accentMode === "custom"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background hover:bg-muted"
            }`}
          >
            Ma couleur
          </button>
        </div>

        {accentMode === "custom" && (
          <>
            <div className="flex flex-wrap gap-2">
              {ACCENT_PRESETS.map((p) => (
                <button
                  key={p.hex}
                  type="button"
                  title={p.label}
                  onClick={() => setAccentHex(p.hex)}
                  className={`h-10 w-10 rounded-full ring-2 ring-offset-2 transition-transform hover:scale-105 ${
                    accentHex.toLowerCase() === p.hex.toLowerCase() ? "ring-primary" : "ring-transparent"
                  }`}
                  style={{ backgroundColor: p.hex }}
                />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Label htmlFor="accent_picker" className="shrink-0 text-sm">
                Nuance
              </Label>
              <input
                id="accent_picker"
                type="color"
                value={accentHex.length === 7 ? accentHex : VITRINE_DEFAULT_ACCENT}
                onChange={(e) => setAccentHex(e.target.value)}
                className="h-11 w-20 cursor-pointer rounded-md border bg-transparent"
              />
              <Input
                className="max-w-[140px] font-mono text-sm"
                value={accentHex}
                onChange={(e) => setAccentHex(e.target.value)}
                placeholder="#ea580c"
                aria-label="Code couleur hex"
              />
            </div>
          </>
        )}
      </div>

      <div className="space-y-2 rounded-2xl border bg-muted/20 p-5">
        <div>
          <Label htmlFor="labor_rate_per_hour" className="text-base">
            Taux horaire main d&apos;œuvre <span className="text-destructive">*</span>
          </Label>
          <p className="mt-1 text-sm text-muted-foreground">
            Utilisé pour calculer automatiquement la main d&apos;œuvre des devis.
          </p>
        </div>
        <div className="space-y-2">
          <Input
            id="labor_rate_per_hour"
            name="labor_rate_per_hour"
            inputMode="decimal"
            placeholder="Ex. 45"
            value={laborRateEur}
            onChange={(e) => setLaborRateEur(e.target.value)}
            className="h-11"
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
        <Button type="submit" size="lg" className="w-full sm:w-auto">
          Enregistrer
        </Button>
        <p className="text-xs text-muted-foreground">Les changements sont visibles tout de suite sur ta page.</p>
      </div>
    </form>
  );
}
