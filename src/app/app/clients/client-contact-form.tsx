"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type ClientContactDefaults = {
  display_name?: string | null;
  phone?: string | null;
  email?: string | null;
  address_line1?: string | null;
  postal_code?: string | null;
  city?: string | null;
};

function national(p: string | null | undefined) {
  if (!p) return "";
  return p.startsWith("+33") ? `0${p.slice(3)}` : p;
}

/** Champs communs création / modification d'une fiche client. */
export function ClientContactFields({ defaults = {} }: { defaults?: ClientContactDefaults }) {
  return (
    <div className="grid gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="cf-name">Nom</Label>
        <Input id="cf-name" name="display_name" required minLength={2} defaultValue={defaults.display_name ?? ""} className="h-11 text-base" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="cf-phone">Téléphone</Label>
          <Input id="cf-phone" name="phone" type="tel" inputMode="tel" defaultValue={national(defaults.phone)} className="h-11 text-base" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cf-email">E-mail</Label>
          <Input id="cf-email" name="email" type="email" defaultValue={defaults.email ?? ""} className="h-11 text-base" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cf-address">Adresse du chantier</Label>
        <Input id="cf-address" name="address_line1" defaultValue={defaults.address_line1 ?? ""} className="h-11 text-base" />
      </div>
      <div className="grid grid-cols-[120px_1fr] gap-3">
        <Input name="postal_code" placeholder="Code postal" inputMode="numeric" defaultValue={defaults.postal_code ?? ""} className="h-11 text-base" />
        <Input name="city" placeholder="Ville" defaultValue={defaults.city ?? ""} className="h-11 text-base" />
      </div>
    </div>
  );
}

export const CLIENT_FORM_ERRORS: Record<string, string> = {
  invalid_name: "Indique un nom (2 caractères minimum).",
  invalid_email: "Adresse e-mail invalide.",
  invalid_phone: "Numéro de téléphone invalide.",
};
