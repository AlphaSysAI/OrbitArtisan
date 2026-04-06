"use client";

import * as React from "react";
import { toast } from "sonner";
import { Pencil, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { deleteService, updateService } from "./actions";

function formatPriceDisplay(price: number | null) {
  if (price == null) return "Sur devis";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(price / 100);
}

export function ServiceRow({
  service,
}: {
  service: { id: string; title: string; duration: number; price: number | null };
}) {
  const [editing, setEditing] = React.useState(false);

  async function onUpdate(formData: FormData) {
    formData.set("service_id", service.id);
    const res = await updateService(formData);
    if (!res.ok) {
      toast.error(
        res.error === "not_found"
          ? "Prestation introuvable."
          : res.error === "invalid_fields"
            ? "Vérifie le titre et la durée."
            : "Impossible d’enregistrer. Réessaie.",
      );
      return;
    }
    toast.success("Prestation mise à jour.");
    setEditing(false);
  }

  const priceEuros =
    service.price != null ? String(service.price / 100).replace(".", ",") : "";

  if (editing) {
    return (
      <li className="rounded-xl border bg-card p-4">
        <form action={onUpdate} className="space-y-4">
          <input type="hidden" name="service_id" value={service.id} />
          <div className="space-y-2">
            <Label htmlFor={`title-${service.id}`}>Intitulé</Label>
            <Input
              id={`title-${service.id}`}
              name="title"
              className="h-11"
              defaultValue={service.title}
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`duration-${service.id}`}>Durée (minutes)</Label>
              <Input
                id={`duration-${service.id}`}
                name="duration"
                type="number"
                className="h-11"
                min={5}
                step={5}
                defaultValue={service.duration}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`price-${service.id}`}>Prix en € (facultatif)</Label>
              <Input
                id={`price-${service.id}`}
                name="price"
                className="h-11"
                inputMode="decimal"
                defaultValue={priceEuros}
                placeholder="65"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit">Enregistrer</Button>
            <Button type="button" variant="outline" onClick={() => setEditing(false)}>
              <X className="mr-1 h-4 w-4" />
              Annuler
            </Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-4">
      <div>
        <p className="font-medium">{service.title}</p>
        <p className="text-sm text-muted-foreground">
          {service.duration} min · {formatPriceDisplay(service.price)}
        </p>
      </div>
      <div className="flex flex-wrap gap-1">
        <Button variant="ghost" size="sm" type="button" onClick={() => setEditing(true)}>
          <Pencil className="mr-1 h-4 w-4" />
          Modifier
        </Button>
        <form action={deleteService}>
          <input type="hidden" name="service_id" value={service.id} />
          <Button variant="ghost" size="sm" type="submit" className="text-destructive hover:text-destructive">
            <Trash2 className="mr-1 h-4 w-4" />
            Retirer
          </Button>
        </form>
      </div>
    </li>
  );
}
