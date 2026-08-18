"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, BookMarked } from "lucide-react";

import { createQuote } from "./actions";
import { aiErrorMessage } from "@/lib/ai/error-messages";
import { WorkItemCombobox } from "@/components/work-library/work-item-combobox";
import { saveQuoteLineToLibrary } from "@/lib/work-library/actions";
import { WORK_UNITS } from "@/lib/work-library/units";
import { loadAiQuoteDraft, clearAiQuoteDraft, type AiQuoteDraft } from "@/lib/ai/quote-draft-storage";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { QuoteMarginBanner } from "@/components/quotes/quote-margin-banner";
import { cn } from "@/lib/utils";

type Service = {
  id: string;
  title: string;
  duration: number;
  price: number | null;
};

type MaterialRow = {
  id: string;
  label: string;
  description: string;
  unit: string;
  vatRate: string;
  quantity: number;
  unitPriceEur: string;
  supplierUrl: string;
  supplierSku: string;
  excludeFromInvoice: boolean;
};

function emptyMaterialRow(): MaterialRow {
  return {
    id: uuid(),
    label: "",
    description: "",
    unit: "U",
    vatRate: "20",
    quantity: 1,
    unitPriceEur: "",
    supplierUrl: "",
    supplierSku: "",
    excludeFromInvoice: false,
  };
}

type SupplierMaterialRow = {
  id: string;
  label: string;
  quantity: number;
  unitPriceEur: string;
  supplierProductId: string | null;
  supplierUrl: string | null;
  supplierSku: string | null;
  excludeFromInvoice: boolean;
  similarity: number | null;
  requestedName: string;
  specifications: string | null;
};

function parseEurToCents(raw: string): number | null {
  const cleaned = raw.trim().replace(",", ".").replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const asNumber = Number(cleaned);
  if (!Number.isFinite(asNumber)) return null;
  return Math.round(asNumber * 100);
}

function uuid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatHoursFromMinutes(minutes: number) {
  if (!Number.isFinite(minutes) || minutes <= 0) return "";
  return (minutes / 60).toFixed(2).replace(".", ",");
}

export function QuoteForm({
  services,
  accentColor,
  profileLaborRatePerHourCents,
  conversationPrefill,
  loadAiDraft = false,
  aiDraftKey,
  serverAiDraft = null,
}: {
  services: Service[];
  accentColor: string;
  profileLaborRatePerHourCents: number | null;
  conversationPrefill?: {
    conversationId: string;
    customerUserId?: string | null;
    customerName: string;
    customerEmail: string;
  } | null;
  /** Charger le brouillon IA depuis sessionStorage. */
  loadAiDraft?: boolean;
  /** Clé sessionStorage (draftKey assistant ou conversationId). */
  aiDraftKey?: string;
  /** Brouillon préchargé côté serveur (lead qualifié). */
  serverAiDraft?: AiQuoteDraft | null;
}) {
  const [selectedServiceIds, setSelectedServiceIds] = React.useState<string[]>([]);
  const [materials, setMaterials] = React.useState<MaterialRow[]>([
    emptyMaterialRow(),
  ]);
  const [supplierMaterials, setSupplierMaterials] = React.useState<SupplierMaterialRow[]>([]);
  const [aiDraftWarnings, setAiDraftWarnings] = React.useState<string[]>([]);
  const [fromAiDraft, setFromAiDraft] = React.useState(false);
  const [fromLeadDraft, setFromLeadDraft] = React.useState(false);
  const [customerName, setCustomerName] = React.useState(conversationPrefill?.customerName ?? "");
  const [customerEmail, setCustomerEmail] = React.useState(conversationPrefill?.customerEmail ?? "");
  const [notes, setNotes] = React.useState("");
  const [aiNotesLoading, setAiNotesLoading] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [pendingSaveMode, setPendingSaveMode] = React.useState<"draft" | "send">("draft");
  const [reducedVatRate, setReducedVatRate] = React.useState("20");
  const [generateVatAttestation, setGenerateVatAttestation] = React.useState(false);
  const [workSiteAddress, setWorkSiteAddress] = React.useState("");
  const [workSiteCity, setWorkSiteCity] = React.useState("");
  const [workSitePostalCode, setWorkSitePostalCode] = React.useState("");

  const [laborRateEur, setLaborRateEur] = React.useState(() => {
    if (profileLaborRatePerHourCents == null) return "";
    return String(profileLaborRatePerHourCents / 100).replace(".", ",");
  });

  /** `auto` = somme des durées des prestations ; `custom` = saisie en heures (chantier réel). */
  const [laborDurationMode, setLaborDurationMode] = React.useState<"auto" | "custom">("auto");
  const [customLaborHoursStr, setCustomLaborHoursStr] = React.useState("");

  function applyAiDraft(draft: AiQuoteDraft) {
    setFromAiDraft(true);
    setFromLeadDraft(draft.source === "lead");
    setPendingSaveMode("draft");
    setAiDraftWarnings(draft.warnings ?? []);
    if (draft.matchedServiceIds.length) {
      setSelectedServiceIds(draft.matchedServiceIds);
    }
    if (draft.laborDurationMinutes > 0) {
      setLaborDurationMode("custom");
      setCustomLaborHoursStr(formatHoursFromMinutes(draft.laborDurationMinutes));
    }
    if (draft.notes?.trim()) setNotes(draft.notes);
    if (draft.customerName?.trim() && !conversationPrefill?.customerName) {
      setCustomerName(draft.customerName);
    }
    if (draft.customerEmail?.trim() && !conversationPrefill?.customerEmail) {
      setCustomerEmail(draft.customerEmail);
    }
    if (draft.supplierMaterials.length) {
      setSupplierMaterials(
        draft.supplierMaterials.map((m) => ({
          id: m.id,
          label: m.label,
          quantity: m.quantity,
          unitPriceEur: m.unitPriceEur,
          supplierProductId: m.supplierProductId,
          supplierUrl: m.supplierUrl,
          supplierSku: m.supplierSku,
          excludeFromInvoice: m.excludeFromInvoice,
          similarity: m.similarity,
          requestedName: m.requestedName,
          specifications: m.specifications,
        })),
      );
    }
    toast.success("Brouillon IA chargé — vérifie puis enregistre. Rien n’est envoyé au client.");
  }

  React.useEffect(() => {
    if (serverAiDraft) {
      applyAiDraft(serverAiDraft);
      return;
    }
    const key = aiDraftKey || conversationPrefill?.conversationId;
    if (!loadAiDraft || !key) return;
    const draft = loadAiQuoteDraft(key);
    if (!draft) return;

    applyAiDraft(draft);
    clearAiQuoteDraft(key);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- charge une seule fois au mount
  }, [loadAiDraft, aiDraftKey, conversationPrefill?.conversationId, serverAiDraft]);

  const selectedServices = React.useMemo(() => {
    const set = new Set(selectedServiceIds);
    return services.filter((s) => set.has(s.id));
  }, [selectedServiceIds, services]);

  const referenceDurationMinutes = React.useMemo(
    () => selectedServices.reduce((acc, s) => acc + (s.duration ?? 0), 0),
    [selectedServices],
  );

  const effectiveLaborMinutes = React.useMemo(() => {
    if (laborDurationMode === "auto") return referenceDurationMinutes;
    const cleaned = customLaborHoursStr.trim().replace(",", ".").replace(/[^0-9.]/g, "");
    if (!cleaned) return 0;
    const hours = Number(cleaned);
    if (!Number.isFinite(hours) || hours <= 0) return 0;
    return Math.round(hours * 60);
  }, [laborDurationMode, referenceDurationMinutes, customLaborHoursStr]);

  const laborRateCents = React.useMemo(() => parseEurToCents(laborRateEur) ?? null, [laborRateEur]);

  const laborTotalCents = React.useMemo(() => {
    if (laborRateCents == null || effectiveLaborMinutes <= 0) return 0;
    return Math.round((laborRateCents * effectiveLaborMinutes) / 60);
  }, [laborRateCents, effectiveLaborMinutes]);

  const materialsTotalCents = React.useMemo(() => {
    const custom = materials.reduce((acc, m) => {
      if (m.excludeFromInvoice) return acc;
      const unit = parseEurToCents(m.unitPriceEur);
      if (!m.label.trim() || unit == null || !Number.isFinite(m.quantity) || m.quantity <= 0) return acc;
      return acc + unit * m.quantity;
    }, 0);
    const supplierBillable = supplierMaterials.reduce((acc, m) => {
      if (m.excludeFromInvoice) return acc;
      const unit = parseEurToCents(m.unitPriceEur);
      if (!m.label.trim() || unit == null || !Number.isFinite(m.quantity) || m.quantity <= 0) return acc;
      return acc + unit * m.quantity;
    }, 0);
    return custom + supplierBillable;
  }, [materials, supplierMaterials]);

  const supplierDirectTotalCents = React.useMemo(() => {
    // Prix indicatif : une ligne en achat direct peut ne pas en avoir, elle compte alors pour 0.
    const sum = (rows: { label: string; quantity: number; unitPriceEur: string; excludeFromInvoice: boolean }[]) =>
      rows.reduce((acc, m) => {
        if (!m.excludeFromInvoice) return acc;
        const unit = parseEurToCents(m.unitPriceEur) ?? 0;
        if (!m.label.trim() || !Number.isFinite(m.quantity) || m.quantity <= 0) return acc;
        return acc + unit * m.quantity;
      }, 0);
    return sum(supplierMaterials) + sum(materials);
  }, [supplierMaterials, materials]);

  const allMaterialsJson = React.useMemo(() => {
    const custom = materials
      .filter((m) => m.label.trim())
      .map((m) => ({
        label: m.label.trim(),
        quantity: m.quantity,
        unit_price_eur: m.unitPriceEur,
        vat_rate: m.vatRate,
        supplier_url: m.supplierUrl.trim() || null,
        supplier_sku: m.supplierSku.trim() || null,
        is_supplier_catalog: false,
        exclude_from_invoice: m.excludeFromInvoice,
      }));
    const supplier = supplierMaterials
      .filter((m) => m.label.trim())
      .map((m) => ({
        label: m.label.trim(),
        quantity: m.quantity,
        unit_price_eur: m.unitPriceEur,
        supplier_product_id: m.supplierProductId,
        supplier_url: m.supplierUrl,
        supplier_sku: m.supplierSku,
        is_supplier_catalog: true,
        exclude_from_invoice: m.excludeFromInvoice,
      }));
    return [...custom, ...supplier];
  }, [materials, supplierMaterials]);

  const grandTotalCents = laborTotalCents + materialsTotalCents;

  const canCreate =
    selectedServiceIds.length > 0 &&
    laborRateCents != null &&
    laborRateCents >= 0 &&
    effectiveLaborMinutes > 0 &&
    (referenceDurationMinutes > 0 || laborDurationMode === "custom");

  async function onAiSuggestNotes() {
    if (!conversationPrefill?.conversationId) return;
    setAiNotesLoading(true);
    try {
      const res = await fetch("/api/ai/suggest-quote-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: conversationPrefill.conversationId,
          customerName,
          customerEmail,
          selectedServices: selectedServices.map((s) => ({
            title: s.title,
            duration: s.duration,
            price: s.price,
          })),
          // L'endpoint se base surtout sur label + quantité.
          materials: materials.map((m) => ({
            label: m.label,
            quantity: m.quantity,
          })),
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(aiErrorMessage(json?.error));
        return;
      }
      const suggested = String(json?.notes ?? "");
      if (!suggested.trim()) {
        toast.error("Texte IA vide");
        return;
      }
      setNotes(suggested);
      toast.success("Notes IA proposées.");
    } catch {
      toast.error("Impossible de proposer les notes par IA.");
    } finally {
      setAiNotesLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canCreate || submitting) {
      if (!canCreate) toast.error("Sélectionne au moins une prestation et renseigne le taux horaire.");
      return;
    }

    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const mode =
      submitter?.value === "send" || submitter?.getAttribute("value") === "send" ? "send" : pendingSaveMode;

    setSubmitting(true);
    try {
      const fd = new FormData(e.currentTarget);
      fd.set("save_mode", mode);
      const res = await createQuote(fd);
      if (!res.ok) {
        toast.error(
          res.error === "missing_services"
            ? "Sélectionne au moins une prestation."
            : res.error === "missing_labor_rate"
              ? "Renseigne le taux horaire dans ton profil."
              : res.error === "invalid_materials"
                ? "Vérifie les fournitures (quantité > 0 et prix valide)."
                : res.error === "invalid_conversation"
                  ? "Conversation invalide."
                  : "Impossible de créer le devis. Réessaie.",
        );
        return;
      }

      if (res.notifyFailed) {
        toast.message("Devis enregistré", {
          description:
            "Le message dans la conversation n’a pas pu être envoyé. Copie le lien depuis la fiche devis.",
        });
      } else if (res.status === "sent") {
        toast.success("Devis enregistré et envoyé au client (message + lien).");
      } else {
        toast.success("Brouillon enregistré — aucun envoi au client.");
      }
      window.location.href = `/app/quotes/${res.quoteId}`;
    } finally {
      setSubmitting(false);
    }
  }

  const accentSelected = (active: boolean) =>
    active
      ? { backgroundColor: accentColor, borderColor: accentColor, color: "#fff" as const }
      : undefined;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Section</p>
          <h1 className="text-2xl font-semibold tracking-tight">Créer un devis</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sélectionne tes prestations, ajoute du matériel si besoin, puis on calcule automatiquement la main-d&apos;œuvre.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/app/quotes" className={cn("rounded-xl px-4 py-2 text-sm", "border bg-card hover:bg-muted")}>
            ← Retour
          </a>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        {fromAiDraft ? (
          <div
            className={cn(
              "rounded-xl border p-4 text-sm",
              fromLeadDraft ? "border-amber-500/40 bg-amber-500/5" : "border-brand/30 bg-brand/5",
            )}
          >
            <p className="font-medium">
              {fromLeadDraft
                ? "Généré depuis une demande qualifiée IA"
                : "Brouillon généré par l’assistant IA"}
            </p>
            <p className="mt-1 text-muted-foreground">
              {fromLeadDraft
                ? "Estimation indicative, à confirmer après visite ou diagnostic. Rien n’est envoyé au client tant que tu ne choisis pas « Envoyer »."
                : "Vérifie chaque ligne. Rien n’est envoyé au client tant que tu ne choisis pas « Envoyer »."}
            </p>
            {aiDraftWarnings.length > 0 ? (
              <ul className="mt-2 list-inside list-disc text-muted-foreground">
                {aiDraftWarnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {/* JSON côté serveur */}
        <input type="hidden" name="service_ids_json" value={JSON.stringify(selectedServiceIds)} />
        <input
          type="hidden"
          name="materials_json"
          value={JSON.stringify(allMaterialsJson)}
        />
        <input type="hidden" name="labor_rate_per_hour_eur" value={laborRateEur} />
        <input type="hidden" name="labor_duration_minutes" value={String(effectiveLaborMinutes)} />
        <input type="hidden" name="reduced_vat_rate" value={reducedVatRate} />
        <input type="hidden" name="generate_vat_attestation" value={generateVatAttestation ? "1" : "0"} />
        <input type="hidden" name="work_site_address" value={workSiteAddress} />
        <input type="hidden" name="work_site_city" value={workSiteCity} />
        <input type="hidden" name="work_site_postal_code" value={workSitePostalCode} />
        {conversationPrefill ? (
          <>
            <input type="hidden" name="conversation_id" value={conversationPrefill.conversationId} />
            {conversationPrefill.customerUserId ? (
              <input type="hidden" name="customer_user_id" value={conversationPrefill.customerUserId} />
            ) : null}
          </>
        ) : null}

        <Card className="border-0 shadow-none">
          <CardHeader>
            <CardTitle className="text-xl">Prestations</CardTitle>
            <CardDescription>Choisis une ou plusieurs prestations à inclure dans le devis.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {services.map((s) => {
                const selected = selectedServiceIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setSelectedServiceIds((prev) =>
                        prev.includes(s.id) ? prev.filter((id) => id !== s.id) : [...prev, s.id],
                      );
                    }}
                    className={cn(
                      "rounded-xl border px-4 py-3 text-left text-sm transition-colors",
                      "hover:bg-muted/80",
                      !accentColor && selected && "border-primary bg-primary text-primary-foreground",
                    )}
                    style={accentSelected(selected)}
                  >
                    <div className="font-medium">{s.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {s.duration} min
                      {s.price != null ? ` · ${new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(s.price / 100)}` : ""}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="text-sm text-muted-foreground">
              Référence (somme des durées des prestations) :{" "}
              <span className="font-medium text-foreground">{referenceDurationMinutes} min</span>
              {" — "}
              tu peux l&apos;ajuster dans la section <span className="font-medium text-foreground">Main d&apos;œuvre</span> si le
              chantier est plus long ou plus court.
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="space-y-6">
            <Card className="border-0 shadow-none">
              <CardHeader>
                <CardTitle className="text-xl">Matériaux fournisseur</CardTitle>
                <CardDescription>
                  Produits trouvés dans le catalogue (ex. Brico Dépôt) via recherche IA. Par défaut exclus de ta
                  facture si le client achète en direct.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!supplierMaterials.length ? (
                  <p className="text-sm text-muted-foreground">
                    Aucun matériau fournisseur — utilisez « Générer le devis par IA » depuis la messagerie ou ajoutez
                    des fournitures manuelles ci-dessous.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {supplierMaterials.map((m) => (
                      <div
                        key={m.id}
                        className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-medium">{m.label}</p>
                            {m.requestedName !== m.label && (
                              <p className="text-xs text-muted-foreground">Demandé : {m.requestedName}</p>
                            )}
                            {m.specifications && (
                              <p className="text-xs text-muted-foreground">{m.specifications}</p>
                            )}
                            {m.similarity != null && (
                              <p className="text-xs text-muted-foreground">
                                Correspondance catalogue : {Math.round(m.similarity * 100)} %
                              </p>
                            )}
                          </div>
                          {m.supplierUrl && (
                            <a
                              href={m.supplierUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                            >
                              Voir chez le fournisseur
                            </a>
                          )}
                        </div>
                        <div className="grid gap-4 sm:grid-cols-[1fr_100px_140px] sm:items-end">
                          <div className="space-y-1">
                            <Label>Réf. fournisseur</Label>
                            <p className="text-sm text-muted-foreground">{m.supplierSku ?? "—"}</p>
                          </div>
                          <div className="space-y-2">
                            <Label>Qté</Label>
                            <Input
                              type="number"
                              min={1}
                              value={m.quantity}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                setSupplierMaterials((prev) =>
                                  prev.map((x) =>
                                    x.id === m.id ? { ...x, quantity: Number.isFinite(v) ? v : 1 } : x,
                                  ),
                                );
                              }}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>
                              Prix unit. (€){" "}
                              {m.excludeFromInvoice && (
                                <span className="font-normal text-muted-foreground">— facultatif</span>
                              )}
                            </Label>
                            <Input
                              inputMode="decimal"
                              placeholder={m.excludeFromInvoice ? "Indicatif" : undefined}
                              value={m.unitPriceEur}
                              onChange={(e) => {
                                const v = e.target.value;
                                setSupplierMaterials((prev) =>
                                  prev.map((x) => (x.id === m.id ? { ...x, unitPriceEur: v } : x)),
                                );
                              }}
                            />
                          </div>
                        </div>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={m.excludeFromInvoice}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setSupplierMaterials((prev) =>
                                prev.map((x) => (x.id === m.id ? { ...x, excludeFromInvoice: checked } : x)),
                              );
                            }}
                            className="rounded border"
                          />
                          Achat direct fournisseur (exclure de ma facture)
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-0 shadow-none">
              <CardHeader>
                <CardTitle className="text-xl">Fournitures / ouvrages (manuel)</CardTitle>
                <CardDescription>
                  Recherche dans ta bibliothèque d&apos;ouvrages ou saisis une ligne libre.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-4">
                  {materials.map((m) => (
                    <div key={m.id} className="rounded-xl border bg-muted/20 p-4 space-y-4">
                      <div className="grid gap-4 lg:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Désignation</Label>
                          <WorkItemCombobox
                            value={m.label}
                            onSelect={(item) => {
                              setMaterials((prev) =>
                                prev.map((x) =>
                                  x.id === m.id
                                    ? {
                                        ...x,
                                        label: item.title,
                                        description: item.description ?? "",
                                        unit: item.unit,
                                        unitPriceEur: String(item.unit_price_ht).replace(".", ","),
                                        vatRate: String(item.default_vat_rate),
                                      }
                                    : x,
                                ),
                              );
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Description</Label>
                          <Input
                            value={m.description}
                            placeholder="Détail technique (facultatif)"
                            onChange={(e) => {
                              const v = e.target.value;
                              setMaterials((prev) =>
                                prev.map((x) => (x.id === m.id ? { ...x, description: v } : x)),
                              );
                            }}
                          />
                        </div>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                        <div className="space-y-2">
                          <Label>Unité</Label>
                          <select
                            className="flex h-10 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none"
                            value={m.unit}
                            onChange={(e) => {
                              const v = e.target.value;
                              setMaterials((prev) => prev.map((x) => (x.id === m.id ? { ...x, unit: v } : x)));
                            }}
                          >
                            {WORK_UNITS.map((u) => (
                              <option key={u} value={u}>
                                {u}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label>Qté</Label>
                          <Input
                            type="number"
                            min={1}
                            step={1}
                            value={m.quantity}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              setMaterials((prev) =>
                                prev.map((x) => (x.id === m.id ? { ...x, quantity: Number.isFinite(v) ? v : 1 } : x)),
                              );
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>
                            Prix unit. HT (€){" "}
                            {m.excludeFromInvoice && (
                              <span className="font-normal text-muted-foreground">— facultatif</span>
                            )}
                          </Label>
                          <Input
                            inputMode="decimal"
                            placeholder={m.excludeFromInvoice ? "Indicatif" : "Ex. 12,50"}
                            value={m.unitPriceEur}
                            onChange={(e) => {
                              const v = e.target.value;
                              setMaterials((prev) => prev.map((x) => (x.id === m.id ? { ...x, unitPriceEur: v } : x)));
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>TVA (%)</Label>
                          <Input
                            inputMode="decimal"
                            value={m.vatRate}
                            onChange={(e) => {
                              const v = e.target.value;
                              setMaterials((prev) => prev.map((x) => (x.id === m.id ? { ...x, vatRate: v } : x)));
                            }}
                          />
                        </div>
                        <div className="flex items-end">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full"
                            disabled={!m.label.trim()}
                            onClick={async () => {
                              const price = parseEurToCents(m.unitPriceEur);
                              const res = await saveQuoteLineToLibrary({
                                title: m.label.trim(),
                                description: m.description.trim() || undefined,
                                unit: m.unit,
                                unit_price_ht: price != null ? price / 100 : 0,
                                default_vat_rate: Number(m.vatRate.replace(",", ".")) || 20,
                              });
                              if (res.ok) toast.success("Ouvrage enregistré dans ta bibliothèque.");
                              else toast.error("Enregistrement impossible.");
                            }}
                          >
                            <BookMarked className="mr-1 size-4" />
                            Bibliothèque
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={m.excludeFromInvoice}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setMaterials((prev) =>
                                prev.map((x) => (x.id === m.id ? { ...x, excludeFromInvoice: checked } : x)),
                              );
                            }}
                            className="rounded border"
                          />
                          Achat direct fournisseur (exclure de ma facture)
                        </label>

                        {m.excludeFromInvoice && (
                          <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
                            <div className="space-y-2">
                              <Label>Lien fournisseur</Label>
                              <Input
                                type="url"
                                inputMode="url"
                                placeholder="https://www.bricomarche.com/p/..."
                                value={m.supplierUrl}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setMaterials((prev) =>
                                    prev.map((x) => (x.id === m.id ? { ...x, supplierUrl: v } : x)),
                                  );
                                }}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Référence</Label>
                              <Input
                                placeholder="Ex. 1234567"
                                value={m.supplierSku}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setMaterials((prev) =>
                                    prev.map((x) => (x.id === m.id ? { ...x, supplierSku: v } : x)),
                                  );
                                }}
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className={cn("text-destructive hover:text-destructive")}
                          onClick={() => {
                            setMaterials((prev) => prev.filter((x) => x.id !== m.id));
                          }}
                          disabled={materials.length <= 1}
                        >
                          <Trash2 className="mr-1 h-4 w-4" />
                          Retirer
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className={cn("w-full justify-center", "gap-2")}
                  onClick={() =>
                    setMaterials((prev) => [...prev, emptyMaterialRow()])
                  }
                >
                  <Plus className="h-4 w-4" />
                  Ajouter une fourniture
                </Button>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-none">
              <CardHeader>
                <CardTitle className="text-xl">TVA réduite & attestation</CardTitle>
                <CardDescription>
                  Pour la rénovation (logement &gt; 2 ans) — génère une attestation PDF en annexe du devis.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reduced_vat_rate">Taux TVA principal du devis</Label>
                  <select
                    id="reduced_vat_rate"
                    className="flex h-10 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none"
                    value={reducedVatRate}
                    onChange={(e) => {
                      setReducedVatRate(e.target.value);
                      if (e.target.value !== "5.5" && e.target.value !== "10") {
                        setGenerateVatAttestation(false);
                      }
                    }}
                  >
                    <option value="20">20 % (taux normal)</option>
                    <option value="10">10 % (rénovation)</option>
                    <option value="5.5">5,5 % (rénovation énergie)</option>
                  </select>
                </div>
                {(reducedVatRate === "10" || reducedVatRate === "5.5") && (
                  <>
                    <label className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={generateVatAttestation}
                        onChange={(e) => setGenerateVatAttestation(e.target.checked)}
                        className="mt-1 rounded border"
                      />
                      <span>Générer l&apos;attestation TVA simplifiée (Cerfa 1301-SD) en PDF après création</span>
                    </label>
                    {generateVatAttestation && (
                      <div className="grid gap-4 sm:grid-cols-3">
                        <div className="space-y-2 sm:col-span-3">
                          <Label>Adresse du chantier *</Label>
                          <Input
                            value={workSiteAddress}
                            onChange={(e) => setWorkSiteAddress(e.target.value)}
                            placeholder="12 rue des Artisans"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Code postal</Label>
                          <Input value={workSitePostalCode} onChange={(e) => setWorkSitePostalCode(e.target.value)} />
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                          <Label>Ville</Label>
                          <Input value={workSiteCity} onChange={(e) => setWorkSiteCity(e.target.value)} />
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="border-0 shadow-none">
              <CardHeader>
                <CardTitle className="text-xl">Infos client & notes</CardTitle>
                <CardDescription>Optionnel au début, utile pour retrouver le devis.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Nom</Label>
                    <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Prénom Nom" />
                  </div>
                  <div className="space-y-2">
                    <Label>Adresse e-mail</Label>
                    <Input
                      type="email"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder="toi@email.fr"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Détails, contraintes, etc." />
                  {conversationPrefill?.conversationId ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2 w-full sm:w-auto gap-2"
                      onClick={onAiSuggestNotes}
                      disabled={aiNotesLoading}
                    >
                      {aiNotesLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Proposer des notes IA
                    </Button>
                  ) : null}
                </div>

                {/* Champs requis/optionnels pour server action */}
                <input type="hidden" name="customer_name" value={customerName} />
                <input type="hidden" name="customer_email" value={customerEmail} />
                <input type="hidden" name="notes" value={notes} />
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="border-0 shadow-none">
              <CardHeader>
                <CardTitle className="text-xl">Main d&apos;œuvre</CardTitle>
                <CardDescription>Taux horaire pré-rempli depuis ton profil.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="labor_rate_per_hour_eur">Taux (€/h)</Label>
                  <Input
                    id="labor_rate_per_hour_eur"
                    inputMode="decimal"
                    value={laborRateEur}
                    onChange={(e) => setLaborRateEur(e.target.value)}
                    placeholder="Ex. 45"
                  />
                </div>
                <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">Durée pour ce devis</p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setLaborDurationMode("auto");
                          setCustomLaborHoursStr("");
                        }}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                          laborDurationMode === "auto"
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background hover:bg-muted",
                        )}
                      >
                        Comme les prestations ({referenceDurationMinutes} min)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setLaborDurationMode("custom");
                          setCustomLaborHoursStr((prev) =>
                            prev || referenceDurationMinutes <= 0 ? prev : formatHoursFromMinutes(referenceDurationMinutes),
                          );
                        }}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                          laborDurationMode === "custom"
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background hover:bg-muted",
                        )}
                      >
                        Personnaliser
                      </button>
                    </div>
                  </div>
                  {laborDurationMode === "custom" && (
                    <div className="space-y-2">
                      <Label htmlFor="custom_labor_hours">Heures de main d&apos;œuvre</Label>
                      <Input
                        id="custom_labor_hours"
                        inputMode="decimal"
                        value={customLaborHoursStr}
                        onChange={(e) => setCustomLaborHoursStr(e.target.value)}
                        placeholder="Ex. 2,5"
                      />
                      <p className="text-xs text-muted-foreground">
                        Remplace la somme des minutes des prestations pour refléter le temps réel sur ce chantier.
                      </p>
                    </div>
                  )}
                </div>
                <div className="text-sm text-muted-foreground">
                  Coût calculé sur la base de la durée ci-dessus et du taux horaire.
                </div>
                <div className="space-y-2 rounded-xl border bg-muted/20 p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span>Durée retenue</span>
                    <span className="font-medium">{effectiveLaborMinutes} min</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Total main-d&apos;œuvre</span>
                    <span className="font-medium">
                      {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(laborTotalCents / 100)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-none">
              <CardHeader>
                <CardTitle className="text-xl">Total</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 rounded-xl border bg-muted/20 p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span>Main d&apos;œuvre</span>
                    <span className="font-medium">
                      {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(laborTotalCents / 100)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Fournitures (facturées)</span>
                    <span className="font-medium">
                      {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(materialsTotalCents / 100)}
                    </span>
                  </div>
                  {supplierDirectTotalCents > 0 && (
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>Matériaux achat direct fournisseur</span>
                      <span>
                        {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
                          supplierDirectTotalCents / 100,
                        )}{" "}
                        (hors facture)
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-2 text-base font-semibold">
                    <span>Total facturé par toi</span>
                    <span>
                      {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(grandTotalCents / 100)}
                    </span>
                  </div>
                </div>

                {!profileLaborRatePerHourCents && (
                  <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                    <span className="font-medium">Taux horaire manquant.</span>
                    {" "}
                    Renseigne-le dans les{" "}
                    <Link href="/app/reglages?tab=activite" className="font-medium underline underline-offset-4">
                      réglages
                    </Link>{" "}
                    pour activer le calcul.
                  </div>
                )}

                <div className="space-y-2">
                  <Button
                    type="submit"
                    name="save_mode"
                    value="draft"
                    className="w-full"
                    style={accentColor ? { backgroundColor: accentColor, color: "#fff" } : undefined}
                    disabled={!canCreate || submitting}
                    onClick={() => setPendingSaveMode("draft")}
                  >
                    {submitting && pendingSaveMode === "draft" ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Enregistrer en brouillon
                  </Button>
                  {conversationPrefill ? (
                    <Button
                      type="submit"
                      name="save_mode"
                      value="send"
                      variant="outline"
                      className="w-full"
                      disabled={!canCreate || submitting}
                      onClick={() => setPendingSaveMode("send")}
                    >
                      {submitting && pendingSaveMode === "send" ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Enregistrer et envoyer au client
                    </Button>
                  ) : (
                    <p className="text-center text-xs text-muted-foreground">
                      Lie un client (via contacts / messages) pour pouvoir envoyer le devis.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
      <QuoteMarginBanner
        grandTotalCents={grandTotalCents}
        laborTotalCents={laborTotalCents}
        materialsTotalCents={materialsTotalCents}
      />
    </div>
  );
}

