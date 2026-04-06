"use client";

import * as React from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { createService } from "./actions";

export function CreateServiceForm({ disabled }: { disabled?: boolean }) {
  const formRef = React.useRef<HTMLFormElement | null>(null);

  async function onSubmit(formData: FormData) {
    const res = await createService(formData);
    if (!res.ok) {
      toast.error(
        res.error === "missing_profile"
          ? "Configure d’abord ton activité (étape 1)."
          : res.error === "invalid_fields"
            ? "Vérifie le titre et la durée."
            : "Impossible d’ajouter. Réessaie.",
      );
      return;
    }
    toast.success("Prestation ajoutée.");
    formRef.current?.reset();
  }

  return (
    <section className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
      <h2 className="text-lg font-semibold">Nouvelle prestation</h2>
      <p className="mt-1 text-sm text-muted-foreground">Titre, durée du RDV, prix si tu veux.</p>

      <form ref={formRef} action={onSubmit} className="mt-6 grid gap-6" aria-disabled={disabled}>
        <div className="space-y-2">
          <Label htmlFor="title" className="text-base">
            Intitulé <span className="text-destructive">*</span>
          </Label>
          <Input
            id="title"
            name="title"
            className="h-11 text-base"
            placeholder="Ex. Dépannage urgence"
            required
            disabled={disabled}
          />
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="duration" className="text-base">
              Durée (minutes) <span className="text-destructive">*</span>
            </Label>
            <Input
              id="duration"
              name="duration"
              type="number"
              className="h-11 text-base"
              min={5}
              step={5}
              placeholder="45"
              required
              disabled={disabled}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="price" className="text-base">
              Prix en € <span className="font-normal text-muted-foreground">(facultatif)</span>
            </Label>
            <Input
              id="price"
              name="price"
              className="h-11 text-base"
              inputMode="decimal"
              placeholder="65"
              disabled={disabled}
            />
            <p className="text-xs text-muted-foreground">Vide = affiché « sur devis ».</p>
          </div>
        </div>

        <Button type="submit" size="lg" disabled={disabled} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          Ajouter la prestation
        </Button>
      </form>
    </section>
  );
}
