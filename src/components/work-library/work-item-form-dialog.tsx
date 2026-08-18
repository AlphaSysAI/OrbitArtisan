"use client";

import * as React from "react";
import { toast } from "sonner";

import {
  computeDebourseSec,
  computeLaborCostFromHours,
  computeMarginPercent,
  computeSellingPriceFromMargin,
  formatEur,
} from "@/lib/work-library/pricing";
import type { WorkCategory, WorkItemWithCategory } from "@/lib/work-library/types";
import { VAT_RATES, WORK_UNITS, type VatRate } from "@/lib/work-library/units";
import { upsertWorkItem } from "@/lib/work-library/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const selectClassName = cn(
  "flex h-10 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm",
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none",
);

function parseNum(raw: string): number {
  const n = Number(raw.replace(",", ".").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function WorkItemFormDialog({
  open,
  onOpenChange,
  categories,
  item,
  defaultHourlyRateHt = 45,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: WorkCategory[];
  item?: WorkItemWithCategory | null;
  defaultHourlyRateHt?: number;
}) {
  const [reference, setReference] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [categoryId, setCategoryId] = React.useState("");
  const [unit, setUnit] = React.useState("U");
  const [unitPriceHt, setUnitPriceHt] = React.useState("0");
  const [vatRate, setVatRate] = React.useState<string>("20");
  const [materialCost, setMaterialCost] = React.useState("0");
  const [estimatedHours, setEstimatedHours] = React.useState("0");
  const [hourlyRate, setHourlyRate] = React.useState(String(defaultHourlyRateHt));
  const [laborCost, setLaborCost] = React.useState("0");
  const [targetMargin, setTargetMargin] = React.useState("30");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    if (item) {
      setReference(item.reference ?? "");
      setTitle(item.title);
      setDescription(item.description ?? "");
      setCategoryId(item.category_id ?? "");
      setUnit(item.unit);
      setUnitPriceHt(String(item.unit_price_ht).replace(".", ","));
      setVatRate(String(item.default_vat_rate));
      setMaterialCost(String(item.material_cost).replace(".", ","));
      setEstimatedHours(String(item.estimated_hours).replace(".", ","));
      setLaborCost(String(item.labor_cost).replace(".", ","));
    } else {
      setReference("");
      setTitle("");
      setDescription("");
      setCategoryId("");
      setUnit("U");
      setUnitPriceHt("0");
      setVatRate("20");
      setMaterialCost("0");
      setEstimatedHours("0");
      setHourlyRate(String(defaultHourlyRateHt));
      setLaborCost("0");
      setTargetMargin("30");
    }
  }, [open, item, defaultHourlyRateHt]);

  const debourse = computeDebourseSec(parseNum(materialCost), parseNum(laborCost));
  const impliedMargin = computeMarginPercent(debourse, parseNum(unitPriceHt));

  function applyLaborFromHours() {
    const cost = computeLaborCostFromHours(parseNum(estimatedHours), parseNum(hourlyRate));
    setLaborCost(String(cost).replace(".", ","));
  }

  function applyPriceFromMargin() {
    const price = computeSellingPriceFromMargin(debourse, parseNum(targetMargin));
    setUnitPriceHt(String(price).replace(".", ","));
  }

  async function handleSave() {
    setSaving(true);
    const res = await upsertWorkItem({
      id: item?.id,
      category_id: categoryId || null,
      reference: reference || null,
      title,
      description: description || null,
      unit,
      unit_price_ht: parseNum(unitPriceHt),
      default_vat_rate: Number(vatRate) as VatRate,
      labor_cost: parseNum(laborCost),
      material_cost: parseNum(materialCost),
      estimated_hours: parseNum(estimatedHours),
    });
    setSaving(false);

    if (!res.ok) {
      toast.error("Impossible d'enregistrer l'ouvrage.");
      return;
    }

    toast.success(item ? "Ouvrage mis à jour." : "Ouvrage ajouté.");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{item ? "Modifier l'ouvrage" : "Nouvel ouvrage"}</DialogTitle>
          <DialogDescription>
            Saisissez le déboursé (fourniture + MO) puis calculez le prix de vente selon votre marge cible.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="wi-title">Titre *</Label>
            <Input id="wi-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wi-ref">Référence</Label>
            <Input id="wi-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wi-cat">Catégorie</Label>
            <select
              id="wi-cat"
              className={selectClassName}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Sans catégorie</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="wi-desc">Description</Label>
            <Textarea id="wi-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wi-unit">Unité</Label>
            <select id="wi-unit" className={selectClassName} value={unit} onChange={(e) => setUnit(e.target.value)}>
              {WORK_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="wi-vat">TVA (%)</Label>
            <select id="wi-vat" className={selectClassName} value={vatRate} onChange={(e) => setVatRate(e.target.value)}>
              {VAT_RATES.map((v) => (
                <option key={v} value={v}>
                  {v} %
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="rounded-xl border bg-muted/30 p-4 space-y-4">
          <p className="text-sm font-semibold">Calculateur de marge</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Coût fournitures (€)</Label>
              <Input value={materialCost} onChange={(e) => setMaterialCost(e.target.value)} inputMode="decimal" />
            </div>
            <div className="space-y-2">
              <Label>Heures estimées</Label>
              <Input value={estimatedHours} onChange={(e) => setEstimatedHours(e.target.value)} inputMode="decimal" />
            </div>
            <div className="space-y-2">
              <Label>Taux horaire (€/h)</Label>
              <div className="flex gap-2">
                <Input value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} inputMode="decimal" />
                <Button type="button" variant="outline" size="sm" onClick={applyLaborFromHours}>
                  MO
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Coût MO (€)</Label>
              <Input value={laborCost} onChange={(e) => setLaborCost(e.target.value)} inputMode="decimal" />
            </div>
            <div className="space-y-2">
              <Label>Marge cible (% PV)</Label>
              <div className="flex gap-2">
                <Input value={targetMargin} onChange={(e) => setTargetMargin(e.target.value)} inputMode="decimal" />
                <Button type="button" variant="outline" size="sm" onClick={applyPriceFromMargin}>
                  PV
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Prix vente HT (€)</Label>
              <Input value={unitPriceHt} onChange={(e) => setUnitPriceHt(e.target.value)} inputMode="decimal" />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Déboursé sec : <strong>{formatEur(debourse)}</strong>
            {impliedMargin != null ? (
              <>
                {" "}
                · Marge implicite : <strong>{impliedMargin} %</strong>
              </>
            ) : null}
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving || !title.trim()}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
