"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, BookMarked } from "lucide-react";

import { createQuote, updateQuote } from "./actions";
import { aiErrorMessage } from "@/lib/ai/error-messages";
import { WorkItemCombobox } from "@/components/work-library/work-item-combobox";
import { saveQuoteLineToLibrary } from "@/lib/work-library/actions";
import { WORK_UNITS } from "@/lib/work-library/units";
import { loadAiQuoteDraft, clearAiQuoteDraft, type AiQuoteDraft } from "@/lib/ai/quote-draft-storage";
import { exactCatalogService, scaleLaborItems, type AiLaborItem } from "@/lib/quotes/ai-labor-items";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { QuoteAiPrompt } from "@/components/quotes/quote-ai-prompt";
import { QuoteAiEditBar } from "@/components/quotes/quote-ai-edit-bar";
import { aiEditQuoteForm } from "./ai-edit-actions";
import { registerQuoteEditor, type QuoteEditorOutcome } from "@/lib/ai/quote-editor-bridge";
import { applyFormPatch, type QuoteFormSnapshot } from "@/lib/quotes/form-patch";
import { QuoteMarginBanner } from "@/components/quotes/quote-margin-banner";
import {
  buildLaborLinesPayload,
  buildMaterialsPayload,
  computeDocumentTotals,
  computeMaterialsTotalCents,
  computeSupplierDirectTotalCents,
  hoursToMinutes,
  laborLineCents,
  lineTotalCents,
  parseEurToCents,
  type LaborLine,
  type MaterialRow,
  type SupplierMaterialRow,
} from "@/lib/quotes/quote-form-totals";
import { safeHttpUrl } from "@/lib/security/safe-url";
import { cn } from "@/lib/utils";
import { formatCents } from "@/lib/format/money";

/** Franchise en base de TVA (293 B) : aucun choix de taux, pas de TVA affichée. */
const VatFranchiseContext = React.createContext(false);

type Service = {
  id: string;
  title: string;
  duration: number;
  price: number | null;
};

function emptyMaterialRow(): MaterialRow {
  return {
    id: uuid(),
    label: "",
    description: "",
    unit: "U",
    vatRate: "",
    quantity: 1,
    unitPriceEur: "",
    supplierUrl: "",
    supplierSku: "",
    excludeFromInvoice: false,
  };
}

function formatEur(cents: number): string {
  return formatCents(cents);
}

function formatVatRate(rate: string | number): string {
  return `${String(rate).replace(".", ",")} %`;
}

function sameVatRate(a: string | number, b: string | number): boolean {
  return Number(String(a).replace(",", ".")) === Number(String(b).replace(",", "."));
}

function uuid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function emptyLaborLine(): LaborLine {
  return { id: uuid(), title: "", hours: "", serviceId: null };
}

/**
 * Lignes de main-d'œuvre depuis un brouillon IA : une ligne par prestation reconnue,
 * au prorata si l'IA a estimé une durée totale différente ; sinon une ligne unique.
 */
function laborLinesFromDraft(
  matched: { id: string; title: string; duration: number }[],
  estimatedMinutes: number,
  aiItems: AiLaborItem[] = [],
  catalog: { id: string; title: string }[] = [],
): LaborLine[] {
  // Phases proposées par l'IA : une ligne chacune, libellé IA conservé ; rattachée au
  // catalogue seulement si une prestation porte exactement ce libellé.
  if (aiItems.length) {
    return scaleLaborItems(aiItems, estimatedMinutes).map((item) => {
      const service = exactCatalogService(catalog, item.title);
      return {
        id: uuid(),
        title: service?.title ?? item.title,
        hours: formatHoursFromMinutes(item.minutes),
        serviceId: service?.id ?? null,
      };
    });
  }
  const sum = matched.reduce((acc, s) => acc + Math.max(0, s.duration), 0);
  if (matched.length && sum > 0) {
    const target = estimatedMinutes > 0 ? estimatedMinutes : sum;
    return matched.map((s) => ({
      id: uuid(),
      title: s.title,
      hours: formatHoursFromMinutes((target * Math.max(0, s.duration)) / sum),
      serviceId: s.id,
    }));
  }
  if (estimatedMinutes > 0) {
    return [
      {
        id: uuid(),
        title: matched.map((s) => s.title).join(", ") || "Main-d'œuvre",
        hours: formatHoursFromMinutes(estimatedMinutes),
        serviceId: null,
      },
    ];
  }
  return [emptyLaborLine()];
}

function formatHoursFromMinutes(minutes: number) {
  if (!Number.isFinite(minutes) || minutes <= 0) return "";
  return (minutes / 60).toFixed(2).replace(".", ",");
}

type EditQuoteInitialData = {
  id: string;
  customerName: string;
  customerEmail: string;
  notes: string;
  laborDurationMinutes: number;
  laborLines: { title: string; minutes: number; serviceId: string | null }[];
  materials: {
    label: string;
    quantity: number;
    unitPriceCents: number;
    vatRate: string;
    excludeFromInvoice: boolean;
  }[];
  reducedVatRate: string;
  workSiteAddress: string;
  workSiteCity: string;
  workSitePostalCode: string;
  retractionWaived: boolean;
};

export function QuoteForm({
  services,
  accentColor,
  profileLaborRatePerHourCents,
  materialsMarginRate = 0,
  conversationPrefill,
  loadAiDraft = false,
  aiDraftKey,
  serverAiDraft = null,
  voiceIntakeId = null,
  editQuote = null,
  clientPrefill = null,
  vatFranchise = false,
}: {
  services: Service[];
  accentColor: string;
  profileLaborRatePerHourCents: number | null;
  /** Marge fournitures des réglages : sert à l'indicateur de marge (jamais affichée au client). */
  materialsMarginRate?: number;
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
  /** Brouillon préchargé côté serveur (lead qualifié ou appel vocal). */
  serverAiDraft?: AiQuoteDraft | null;
  /** Lien vers l'appel Soline source (validation après envoi). */
  voiceIntakeId?: string | null;
  /** Édition d'un brouillon existant — bascule le formulaire en mode édition (updateQuote). */
  editQuote?: EditQuoteInitialData | null;
  /** Nouveau devis lancé depuis une fiche client (client sans compte). */
  clientPrefill?: { clientId: string; customerName: string; customerEmail: string } | null;
  /** Entreprise en franchise de TVA (art. 293 B du CGI). */
  vatFranchise?: boolean;
}) {
  const [laborLines, setLaborLines] = React.useState<LaborLine[]>([emptyLaborLine()]);
  const [materials, setMaterials] = React.useState<MaterialRow[]>([
    emptyMaterialRow(),
  ]);
  const [supplierMaterials, setSupplierMaterials] = React.useState<SupplierMaterialRow[]>([]);
  const [aiDraftWarnings, setAiDraftWarnings] = React.useState<string[]>([]);
  const [fromAiDraft, setFromAiDraft] = React.useState(false);
  const [fromLeadDraft, setFromLeadDraft] = React.useState(false);
  const [fromVoiceDraft, setFromVoiceDraft] = React.useState(Boolean(voiceIntakeId));
  const [customerName, setCustomerName] = React.useState(
    conversationPrefill?.customerName ?? clientPrefill?.customerName ?? "",
  );
  const [customerEmail, setCustomerEmail] = React.useState(
    conversationPrefill?.customerEmail ?? clientPrefill?.customerEmail ?? "",
  );
  const [notes, setNotes] = React.useState("");
  const [aiNotesLoading, setAiNotesLoading] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [pendingSaveMode, setPendingSaveMode] = React.useState<"draft" | "send">("draft");
  const [reducedVatRate, setReducedVatRate] = React.useState(vatFranchise ? "0" : "20");
  const [workSiteAddress, setWorkSiteAddress] = React.useState("");
  const [workSiteCity, setWorkSiteCity] = React.useState("");
  const [workSitePostalCode, setWorkSitePostalCode] = React.useState("");
  const [retractionWaived, setRetractionWaived] = React.useState(false);

  const [laborRateEur, setLaborRateEur] = React.useState(() => {
    if (profileLaborRatePerHourCents == null) return "";
    return String(profileLaborRatePerHourCents / 100).replace(".", ",");
  });

  /** `auto` = somme des durées des prestations ; `custom` = saisie en heures (chantier réel). */

  function applyAiDraft(draft: AiQuoteDraft) {
    setFromAiDraft(true);
    setFromLeadDraft(draft.source === "lead");
    setFromVoiceDraft(draft.source === "voice" || Boolean(voiceIntakeId));
    setPendingSaveMode("draft");
    setAiDraftWarnings(draft.warnings ?? []);
    const aiLaborItems = draft.laborItems ?? [];
    if (aiLaborItems.length || draft.matchedServiceIds.length || draft.laborDurationMinutes > 0) {
      const matched = draft.matchedServiceIds
        .map((id) => services.find((s) => s.id === id))
        .filter((s): s is Service => !!s);
      setLaborLines(laborLinesFromDraft(matched, draft.laborDurationMinutes, aiLaborItems, services));
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

  React.useEffect(() => {
    if (!editQuote) return;
    {
      // Anciens devis : durée facturée parfois ajustée à la main (≠ somme des lignes).
      // On répartit cette durée au prorata pour conserver exactement le montant enregistré.
      const lines = editQuote.laborLines;
      const sum = lines.reduce((acc, l) => acc + Math.max(0, l.minutes), 0);
      const billed = editQuote.laborDurationMinutes;
      if (!lines.length) {
        setLaborLines(
          billed > 0
            ? [{ id: uuid(), title: "Main-d'œuvre", hours: formatHoursFromMinutes(billed), serviceId: null }]
            : [emptyLaborLine()],
        );
      } else {
        setLaborLines(
          lines.map((l) => ({
            id: uuid(),
            title: l.title,
            hours: formatHoursFromMinutes(
              billed > 0 && sum > 0 ? (billed * Math.max(0, l.minutes)) / sum : l.minutes,
            ),
            serviceId: l.serviceId,
          })),
        );
      }
    }
    setCustomerName(editQuote.customerName);
    setCustomerEmail(editQuote.customerEmail);
    setNotes(editQuote.notes);
    setReducedVatRate(editQuote.reducedVatRate);
    setWorkSiteAddress(editQuote.workSiteAddress);
    setWorkSiteCity(editQuote.workSiteCity);
    setWorkSitePostalCode(editQuote.workSitePostalCode);
    setRetractionWaived(editQuote.retractionWaived);
    if (editQuote.materials.length) {
      setMaterials(
        editQuote.materials.map((m) => ({
          id: uuid(),
          label: m.label,
          description: "",
          unit: "U",
          vatRate: sameVatRate(m.vatRate, editQuote.reducedVatRate) ? "" : m.vatRate,
          quantity: m.quantity,
          unitPriceEur: (m.unitPriceCents / 100).toString().replace(".", ","),
          supplierUrl: "",
          supplierSku: "",
          excludeFromInvoice: m.excludeFromInvoice,
        })),
      );
    }
  }, [editQuote]);

  const laborLinesPayload = React.useMemo(() => buildLaborLinesPayload(laborLines), [laborLines]);

  const laborLinesInvalid = laborLinesPayload.some((l) => !l.title || l.minutes <= 0);

  const effectiveLaborMinutes = React.useMemo(
    () => laborLinesPayload.reduce((acc, l) => acc + l.minutes, 0),
    [laborLinesPayload],
  );

  const laborRateCents = React.useMemo(() => parseEurToCents(laborRateEur) ?? null, [laborRateEur]);

  const laborTotalCents = React.useMemo(() => {
    if (laborRateCents == null || effectiveLaborMinutes <= 0) return 0;
    return Math.round((laborRateCents * effectiveLaborMinutes) / 60);
  }, [laborRateCents, effectiveLaborMinutes]);

  const materialsTotalCents = React.useMemo(
    () => computeMaterialsTotalCents(materials, supplierMaterials),
    [materials, supplierMaterials],
  );

  const supplierDirectTotalCents = React.useMemo(
    () => computeSupplierDirectTotalCents(materials, supplierMaterials),
    [supplierMaterials, materials],
  );

  const allMaterialsJson = React.useMemo(
    () => buildMaterialsPayload(materials, supplierMaterials, reducedVatRate),
    [materials, supplierMaterials, reducedVatRate],
  );

  const grandTotalCents = laborTotalCents + materialsTotalCents;

  // Aperçu calculé avec EXACTEMENT les mêmes fonctions que le PDF envoyé au client.
  const documentTotals = React.useMemo(
    () =>
      computeDocumentTotals({
        laborLinesPayload,
        materialsPayload: allMaterialsJson,
        laborTotalCents,
        effectiveLaborMinutes,
        laborRateCents,
        reducedVatRate,
      }),
    [laborLinesPayload, allMaterialsJson, laborTotalCents, effectiveLaborMinutes, laborRateCents, reducedVatRate],
  );

  // Handlers stables (perf) : les lignes sont mémoïsées, taper dans une ligne
  // ne re-rend plus toutes les autres (ni le catalogue fournisseurs).
  const updateLaborLine = React.useCallback((id: string, patch: Partial<LaborLine>) => {
    setLaborLines((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }, []);
  const removeLaborLine = React.useCallback((id: string) => {
    setLaborLines((prev) => {
      const next = prev.filter((x) => x.id !== id);
      return next.length ? next : [emptyLaborLine()];
    });
  }, []);
  const updateSupplierMaterial = React.useCallback((id: string, patch: Partial<SupplierMaterialRow>) => {
    setSupplierMaterials((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }, []);
  const updateMaterial = React.useCallback((id: string, patch: Partial<MaterialRow>) => {
    setMaterials((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }, []);
  const removeMaterial = React.useCallback((id: string) => {
    setMaterials((prev) => prev.filter((x) => x.id !== id));
  }, []);

  // ── Modification par consigne (barre « Modifier avec l'IA » + assistant flottant) ──
  type EditableState = {
    laborLines: LaborLine[];
    materials: MaterialRow[];
    supplierMaterials: SupplierMaterialRow[];
    laborRateEur: string;
    notes: string;
  };
  const liveStateRef = React.useRef<EditableState>({ laborLines, materials, supplierMaterials, laborRateEur, notes });
  liveStateRef.current = { laborLines, materials, supplierMaterials, laborRateEur, notes };
  const [undoState, setUndoState] = React.useState<EditableState | null>(null);

  const hasQuoteContent =
    supplierMaterials.length > 0 ||
    materials.some((m) => m.label.trim()) ||
    laborLines.some((l) => l.title.trim() || hoursToMinutes(l.hours) > 0);

  const editWithAi = React.useCallback(async (instruction: string): Promise<QuoteEditorOutcome> => {
    const state = liveStateRef.current;
    const eurNum = (raw: string) => {
      const cents = parseEurToCents(raw);
      return cents === null ? null : cents / 100;
    };
    const snapshot: QuoteFormSnapshot = {
      lines: [
        ...state.supplierMaterials.map((m) => ({
          id: m.id,
          source: "supplier" as const,
          label: m.label,
          quantity: m.quantity,
          unitPriceEur: eurNum(m.unitPriceEur),
        })),
        ...state.materials
          .filter((m) => m.label.trim())
          .map((m) => ({ id: m.id, source: "manual" as const, label: m.label, quantity: m.quantity, unitPriceEur: eurNum(m.unitPriceEur) })),
      ],
      labor: state.laborLines
        .filter((l) => l.title.trim() || hoursToMinutes(l.hours) > 0)
        .map((l) => ({ id: l.id, title: l.title, hours: Math.round((hoursToMinutes(l.hours) / 60) * 100) / 100 })),
      laborRateEur: eurNum(state.laborRateEur),
      notes: state.notes,
    };

    const res = await aiEditQuoteForm({ snapshot, instruction });
    if (!res.ok) {
      return {
        ok: false,
        message:
          res.error === "rate_limited"
            ? "Trop de modifications en peu de temps : réessaie dans quelques minutes."
            : res.error === "invalid"
              ? "Consigne trop courte ou devis illisible."
              : "La modification n’a pas abouti. Reformule ou modifie la ligne à la main.",
      };
    }

    const applied = applyFormPatch(snapshot, res.patch, uuid);
    if (!applied.changes.length) return { ok: true, changes: [], warnings: applied.warnings };

    const next = applied.snapshot;
    const byId = new Map(next.lines.map((l) => [l.id, l]));
    const commaEur = (n: number | null) => (n === null ? "" : n.toFixed(2).replace(".", ","));

    setUndoState(state);
    setSupplierMaterials(
      state.supplierMaterials
        .filter((m) => byId.has(m.id))
        .map((m) => {
          const l = byId.get(m.id)!;
          return { ...m, label: l.label, quantity: l.quantity, unitPriceEur: l.unitPriceEur === null ? m.unitPriceEur : l.unitPriceEur.toFixed(2) };
        }),
    );
    const knownManual = new Set(state.materials.map((m) => m.id));
    setMaterials([
      ...state.materials
        .filter((m) => !m.label.trim() ? false : byId.has(m.id))
        .map((m) => {
          const l = byId.get(m.id)!;
          return { ...m, label: l.label, quantity: l.quantity, unitPriceEur: commaEur(l.unitPriceEur) };
        }),
      ...next.lines
        .filter((l) => l.source === "manual" && !knownManual.has(l.id))
        .map((l) => ({ ...emptyMaterialRow(), id: l.id, label: l.label, quantity: l.quantity, unitPriceEur: commaEur(l.unitPriceEur) })),
    ]);
    const laborById = new Map(state.laborLines.map((l) => [l.id, l]));
    const nextLabor = next.labor.map((l) => ({
      ...(laborById.get(l.id) ?? { serviceId: null }),
      id: l.id,
      title: l.title,
      hours: formatHoursFromMinutes(Math.round(l.hours * 60)),
    }));
    setLaborLines(nextLabor.length ? nextLabor : [emptyLaborLine()]);
    if (next.laborRateEur !== snapshot.laborRateEur && next.laborRateEur !== null) setLaborRateEur(commaEur(next.laborRateEur));
    if (next.notes !== state.notes) setNotes(next.notes);

    return { ok: true, changes: applied.changes, warnings: [...res.pricingNotes, ...applied.warnings] };
  }, []);

  const undoAiEdit = React.useCallback(() => {
    if (!undoState) return;
    setLaborLines(undoState.laborLines);
    setMaterials(undoState.materials);
    setSupplierMaterials(undoState.supplierMaterials);
    setLaborRateEur(undoState.laborRateEur);
    setNotes(undoState.notes);
    setUndoState(null);
    toast.success("Modification annulée.");
  }, [undoState]);

  // L'assistant flottant modifie ce devis au lieu d'en générer un nouveau.
  React.useEffect(() => {
    if (!hasQuoteContent) return;
    return registerQuoteEditor(editWithAi);
  }, [hasQuoteContent, editWithAi]);

  // Main-d'œuvre facultative : un devis peut ne contenir que des fournitures.
  const laborRateMissing = effectiveLaborMinutes > 0 && (laborRateCents == null || laborRateCents <= 0);
  const canCreate = !laborLinesInvalid && !laborRateMissing && grandTotalCents > 0;
  const cannotCreateReason = laborLinesInvalid
    ? "Chaque ligne de main-d'œuvre doit avoir une désignation et un nombre d'heures."
    : laborRateMissing
      ? "Renseigne le taux horaire."
      : "Ajoute au moins une ligne de main-d'œuvre ou une fourniture avec un prix.";

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
          selectedServices: laborLinesPayload.map((l) => ({
            title: l.title,
            duration: l.minutes,
            price: null,
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
      if (!canCreate) toast.error(cannotCreateReason);
      return;
    }

    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const mode =
      submitter?.value === "send" || submitter?.getAttribute("value") === "send" ? "send" : pendingSaveMode;

    setSubmitting(true);
    try {
      const fd = new FormData(e.currentTarget);
      fd.set("save_mode", mode);
      const res = editQuote ? await updateQuote(editQuote.id, fd) : await createQuote(fd);
      if (!res.ok) {
        toast.error(
          res.error === "empty_quote"
            ? "Ajoute au moins une ligne de main-d'œuvre ou une fourniture avec un prix."
            : res.error === "invalid_duration"
              ? "Chaque ligne de main-d'œuvre doit avoir une désignation et un nombre d'heures."
            : res.error === "missing_labor_rate"
              ? "Renseigne le taux horaire dans ton profil."
              : res.error === "invalid_materials"
                ? "Vérifie les fournitures (quantité > 0 et prix valide)."
                : res.error === "invalid_conversation"
                  ? "Conversation invalide."
                  : res.error === "missing_customer"
                    ? "Renseigne le nom ou l'e-mail du client avant envoi."
                    : res.error === "quote_pdf_profile_incomplete"
                      ? `Complète ton profil avant envoi : ${("validation" in res ? res.validation.blocking : []).join(" ")}`
                      : res.error === "not_editable" || res.error === "not_found"
                        ? "Ce brouillon n'est plus modifiable (déjà envoyé ou supprimé) — recharge la page."
                        : editQuote
                          ? "Impossible d'enregistrer les modifications. Réessaie."
                          : "Impossible de créer le devis. Réessaie.",
        );
        return;
      }

      if (res.notifyFailed) {
        toast.message("Devis enregistré", {
          description:
            "Le message avec le PDF n’a pas pu être envoyé. Télécharge le devis depuis la fiche et envoie-le manuellement.",
        });
      } else if (res.status === "sent") {
        toast.success(
          res.emailSent
            ? "Devis enregistré et envoyé au client par email."
            : "Devis enregistré et envoyé au client (PDF dans la conversation).",
        );
      } else {
        toast.success("Brouillon enregistré — aucun envoi au client.");
      }
      window.location.href = `/app/quotes/${res.quoteId}`;
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Section</p>
          <h1 className="text-2xl font-semibold tracking-tight">{editQuote ? "Modifier le brouillon" : "Créer un devis"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sélectionne tes prestations, ajoute du matériel si besoin, puis on calcule automatiquement la main-d&apos;œuvre.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/app/quotes" className={cn("rounded-xl px-4 py-2 text-sm", "border bg-card hover:bg-muted")}>
            ← Retour
          </Link>
        </div>
      </div>

      {!fromAiDraft ? <QuoteAiPrompt /> : null}

      <VatFranchiseContext.Provider value={vatFranchise}>
      <form onSubmit={onSubmit} className="space-y-6">
        {fromAiDraft ? (
          <div
            className={cn(
              "rounded-xl border p-4 text-sm",
              fromLeadDraft
                ? "border-amber-500/40 bg-amber-500/5"
                : fromVoiceDraft
                  ? "border-violet-500/40 bg-violet-500/5"
                  : "border-brand/30 bg-brand/5",
            )}
          >
            <p className="font-medium">
              {fromLeadDraft
                ? "Généré depuis une demande qualifiée IA"
                : fromVoiceDraft
                  ? "Proposition depuis un appel Soline"
                  : "Brouillon généré par l’assistant IA"}
            </p>
            <p className="mt-1 text-muted-foreground">
              {fromLeadDraft
                ? "Estimation indicative, à confirmer après visite ou diagnostic. Rien n’est envoyé au client tant que tu ne choisis pas « Envoyer »."
                : fromVoiceDraft
                  ? "Vérifie chaque ligne. « Enregistrer et envoyer » enverra le devis par email au client."
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

        {hasQuoteContent ? (
          <QuoteAiEditBar onEdit={editWithAi} canUndo={undoState !== null} onUndo={undoAiEdit} />
        ) : null}

        {/* JSON côté serveur */}
        <input type="hidden" name="labor_lines_json" value={JSON.stringify(laborLinesPayload)} />
        <input
          type="hidden"
          name="materials_json"
          value={JSON.stringify(allMaterialsJson)}
        />
        <input type="hidden" name="labor_rate_per_hour_eur" value={laborRateEur} />
        <input type="hidden" name="reduced_vat_rate" value={reducedVatRate} />
        <input type="hidden" name="work_site_address" value={workSiteAddress} />
        <input type="hidden" name="retraction_waived" value={retractionWaived ? "1" : "0"} />
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
        {voiceIntakeId ? <input type="hidden" name="voice_intake_id" value={voiceIntakeId} /> : null}
        {clientPrefill ? <input type="hidden" name="client_id" value={clientPrefill.clientId} /> : null}

        <Card className="border-0 shadow-none">
          <CardHeader>
            <CardTitle className="text-xl">Main-d&apos;œuvre</CardTitle>
            <CardDescription>
              Une ligne par poste de travail : désignation + heures, au taux horaire ci-dessous. Facultatif pour un
              devis de fournitures seules.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[200px_1fr] sm:items-end">
              <div className="space-y-2">
                <Label htmlFor="labor_rate_per_hour_eur">Taux horaire HT (€/h)</Label>
                <Input
                  id="labor_rate_per_hour_eur"
                  inputMode="decimal"
                  value={laborRateEur}
                  onChange={(e) => setLaborRateEur(e.target.value)}
                  placeholder="Ex. 45"
                />
              </div>
              {services.length ? (
                <div className="space-y-2">
                  <Label htmlFor="add_from_catalog">Ajouter depuis mes prestations (facultatif)</Label>
                  <select
                    id="add_from_catalog"
                    className="flex h-10 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none"
                    value=""
                    onChange={(e) => {
                      const service = services.find((s) => s.id === e.target.value);
                      if (!service) return;
                      const line: LaborLine = {
                        id: uuid(),
                        title: service.title,
                        hours: formatHoursFromMinutes(service.duration),
                        serviceId: service.id,
                      };
                      setLaborLines((prev) => {
                        const kept = prev.filter((l) => l.title.trim() || l.hours.trim());
                        return [...kept, line];
                      });
                    }}
                  >
                    <option value="">Choisir une prestation…</option>
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title}
                        {s.duration > 0 ? ` (${formatHoursFromMinutes(s.duration)} h)` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>

            <div className="space-y-3">
              {laborLines.map((line) => (
                <LaborLineRow
                  key={line.id}
                  line={line}
                  laborRateCents={laborRateCents}
                  reducedVatRate={reducedVatRate}
                  onChange={updateLaborLine}
                  onRemove={removeLaborLine}
                />
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full gap-2"
              onClick={() => setLaborLines((prev) => [...prev, emptyLaborLine()])}
            >
              <Plus className="h-4 w-4" />
              Ajouter une ligne de main-d&apos;œuvre
            </Button>

            <div className="flex items-center justify-between rounded-xl border bg-muted/20 px-4 py-3 text-sm">
              <span>
                Total main-d&apos;œuvre HT
                {effectiveLaborMinutes > 0 ? ` · ${formatHoursFromMinutes(effectiveLaborMinutes)} h` : ""}
              </span>
              <span className="font-semibold tabular-nums">{formatEur(laborTotalCents)}</span>
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
                      <SupplierMaterialRowEditor
                        key={m.id}
                        m={m}
                        reducedVatRate={reducedVatRate}
                        onChange={updateSupplierMaterial}
                      />
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
                    <MaterialRowEditor
                      key={m.id}
                      m={m}
                      reducedVatRate={reducedVatRate}
                      canRemove={materials.length > 1}
                      onChange={updateMaterial}
                      onRemove={removeMaterial}
                    />
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

            {vatFranchise ? (
              <p className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
                Franchise en base de TVA : le devis portera « TVA non applicable, art. 293 B du CGI ». Prix nets, sans TVA.
              </p>
            ) : (
            <Card className="border-0 shadow-none">
              <CardHeader>
                <CardTitle className="text-xl">TVA du devis</CardTitle>
                <CardDescription>
                  S&apos;applique à la main-d&apos;œuvre et à toutes les fournitures. Une ligne peut avoir un
                  autre taux si besoin (menu « TVA » de la ligne). Taux réduits : logement de plus de 2 ans,
                  certifié par le client sur le devis.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reduced_vat_rate">Taux de TVA</Label>
                  <select
                    id="reduced_vat_rate"
                    className="flex h-10 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none"
                    value={reducedVatRate}
                    onChange={(e) => {
                      setReducedVatRate(e.target.value);
                    }}
                  >
                    <option value="20">20 % (taux normal)</option>
                    <option value="10">10 % (rénovation)</option>
                    <option value="5.5">5,5 % (rénovation énergie)</option>
                  </select>
                </div>
                {(reducedVatRate === "10" || reducedVatRate === "5.5") && (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Le devis portera la certification du client (logement de plus de 2 ans, pas de construction
                      neuve ni d&apos;agrandissement de plus de 10 %) : il la valide en signant. L&apos;ancienne
                      attestation séparée n&apos;existe plus depuis le 1er mars 2025.
                    </p>
                    {(
                      <div className="grid gap-4 sm:grid-cols-3">
                        <div className="space-y-2 sm:col-span-3">
                          <Label>Adresse du logement concerné</Label>
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
            )}

            <Card className="border-0 shadow-none">
              <CardHeader>
                <CardTitle className="text-xl">Droit de rétractation</CardTitle>
                <CardDescription>
                  Un devis signé hors de ton établissement (domicile du client, chantier) déclenche par défaut
                  un délai légal de 14 jours avant de pouvoir commencer les travaux.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={retractionWaived}
                    onChange={(e) => setRetractionWaived(e.target.checked)}
                    className="mt-1 rounded border"
                  />
                  <span>
                    Le client demande expressément l&apos;exécution immédiate des travaux avant la fin du délai de
                    rétractation (renonciation expresse, art. L221-28 3° du Code de la consommation).
                  </span>
                </label>
                <p className="text-xs text-muted-foreground">
                  {retractionWaived
                    ? "Le PDF affichera la mention de renonciation avec une ligne de signature dédiée, à la place du délai de 14 jours."
                    : "Par défaut (recommandé) : le PDF affiche le délai de 14 jours et le formulaire type de rétractation."}
                </p>
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
                <CardTitle className="text-xl">Total</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 rounded-xl border bg-muted/20 p-4">
                  <TotalRow label="Main-d'œuvre HT" cents={laborTotalCents} />
                  <TotalRow label="Fournitures HT" cents={materialsTotalCents} />
                  <div className="border-t pt-2">
                    <TotalRow label="Total HT" cents={documentTotals.totalHtCents} strong />
                  </div>
                  {vatFranchise ? (
                    <p className="text-xs text-muted-foreground">TVA non applicable, art. 293 B du CGI</p>
                  ) : documentTotals.vatBreakdown.length === 0 ? (
                    <TotalRow label={`TVA (${formatVatRate(reducedVatRate)})`} cents={0} muted />
                  ) : (
                    documentTotals.vatBreakdown.map((row) => (
                      <TotalRow
                        key={row.rate}
                        label={`TVA ${formatVatRate(row.rate)}${
                          documentTotals.vatBreakdown.length > 1 ? ` sur ${formatEur(row.baseHtCents)}` : ""
                        }`}
                        cents={row.vatCents}
                        muted
                      />
                    ))
                  )}
                  <div className="flex items-center justify-between border-t pt-2 text-lg font-semibold">
                    <span>{vatFranchise ? "Total net" : "Total TTC"}</span>
                    <span className="tabular-nums">{formatEur(documentTotals.totalTtcCents)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Montant identique au PDF envoyé au client.</p>
                </div>

                {supplierDirectTotalCents > 0 && (
                  <div className="rounded-xl border border-dashed p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Achats directs du client</span>
                      <span className="tabular-nums">{formatEur(supplierDirectTotalCents)}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Payés par le client directement au fournisseur. Non inclus dans le total du devis (listés en
                      annexe du PDF).
                    </p>
                  </div>
                )}

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
                  {conversationPrefill || (fromVoiceDraft && customerEmail.trim()) ? (
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
                      {fromVoiceDraft ? "Enregistrer et envoyer par email" : "Enregistrer et envoyer au client"}
                    </Button>
                  ) : (
                    <p className="text-center text-xs text-muted-foreground">
                      Lie un client (via contacts / messages) ou renseigne un email pour envoyer le devis.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
      </VatFranchiseContext.Provider>
      <QuoteMarginBanner
        grandTotalCents={grandTotalCents}
        laborTotalCents={laborTotalCents}
        materialsTotalCents={materialsTotalCents}
        materialsMarginRate={materialsMarginRate}
      />
    </div>
  );
}

function TotalRow({
  label,
  cents,
  strong,
  muted,
}: {
  label: string;
  cents: number;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between text-sm",
        strong && "font-semibold",
        muted && "text-muted-foreground",
      )}
    >
      <span>{label}</span>
      <span className="tabular-nums">{formatEur(cents)}</span>
    </div>
  );
}

/** Total HT de la ligne, visible en permanence sous la saisie. */
function LineTotal({
  quantity,
  unitPriceEur,
  excluded,
  vatLabel,
  vatOverridden,
}: {
  quantity: number;
  unitPriceEur: string;
  excluded: boolean;
  vatLabel: string;
  vatOverridden?: boolean;
}) {
  const total = lineTotalCents(quantity, unitPriceEur);
  const franchise = React.useContext(VatFranchiseContext);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background/70 px-3 py-2 text-sm">
      <span className="text-muted-foreground">
        {excluded ? (
          "Achat direct du client — hors total du devis"
        ) : franchise ? (
          "Sans TVA (293 B)"
        ) : (
          <>
            TVA {vatLabel}
            {vatOverridden ? <span className="ml-1 font-medium text-amber-700">(taux spécifique)</span> : null}
          </>
        )}
      </span>
      <span className={cn("tabular-nums", excluded ? "text-muted-foreground" : "font-semibold")}>
        {total == null ? "Prix à renseigner" : `${formatEur(total)}${franchise ? "" : " HT"}`}
      </span>
    </div>
  );
}


/**
 * Lignes mémoïsées (refacto latence, point 8) : une frappe dans une ligne ne
 * re-rend que cette ligne et le bloc Total, plus tout le formulaire. Les
 * calculs restent ceux de `lib/quotes/quote-form-totals` (mêmes fonctions
 * que le PDF).
 */
const LaborLineRow = React.memo(function LaborLineRow({
  line,
  laborRateCents,
  reducedVatRate,
  onChange,
  onRemove,
}: {
  line: LaborLine;
  laborRateCents: number | null;
  reducedVatRate: string;
  onChange: (id: string, patch: Partial<LaborLine>) => void;
  onRemove: (id: string) => void;
}) {
  const minutes = hoursToMinutes(line.hours);
  const lineCents = laborLineCents(laborRateCents, minutes);
  return (
    <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_120px_auto] sm:items-end">
        <div className="space-y-2">
          <Label>Désignation</Label>
          <Input
            value={line.title}
            placeholder="Ex. Pose de carrelage salle de bain"
            onChange={(e) => onChange(line.id, { title: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>Heures</Label>
          <Input
            inputMode="decimal"
            value={line.hours}
            placeholder="Ex. 2,5"
            onChange={(e) => onChange(line.id, { hours: e.target.value })}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={() => onRemove(line.id)}
        >
          <Trash2 className="mr-1 h-4 w-4" />
          Retirer
        </Button>
      </div>
      <div className="flex items-center justify-between rounded-lg bg-background/70 px-3 py-2 text-sm">
        <span className="text-muted-foreground">
          {minutes > 0 && laborRateCents != null
            ? `${line.hours.trim()} h × ${formatEur(laborRateCents)}/h${reducedVatRate === "0" ? "" : ` · TVA ${formatVatRate(reducedVatRate)}`}`
            : "Heures à renseigner"}
        </span>
        <span className="font-semibold tabular-nums">{lineCents == null ? "—" : `${formatEur(lineCents)} HT`}</span>
      </div>
    </div>
  );
});

const SupplierMaterialRowEditor = React.memo(function SupplierMaterialRowEditor({
  m,
  reducedVatRate,
  onChange,
}: {
  m: SupplierMaterialRow;
  reducedVatRate: string;
  onChange: (id: string, patch: Partial<SupplierMaterialRow>) => void;
}) {
  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{m.label}</p>
          {m.requestedName !== m.label && <p className="text-xs text-muted-foreground">Demandé : {m.requestedName}</p>}
          {m.specifications && <p className="text-xs text-muted-foreground">{m.specifications}</p>}
          {m.similarity != null && (
            <p className="text-xs text-muted-foreground">
              Correspondance catalogue : {Math.round(m.similarity * 100)} %
            </p>
          )}
        </div>
        {safeHttpUrl(m.supplierUrl) && (
          <a
            href={safeHttpUrl(m.supplierUrl)!}
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
              onChange(m.id, { quantity: Number.isFinite(v) ? v : 1 });
            }}
          />
        </div>
        <div className="space-y-2">
          <Label>
            Prix unit. (€){" "}
            {m.excludeFromInvoice && <span className="font-normal text-muted-foreground">— facultatif</span>}
          </Label>
          <Input
            inputMode="decimal"
            placeholder={m.excludeFromInvoice ? "Indicatif" : undefined}
            value={m.unitPriceEur}
            onChange={(e) => onChange(m.id, { unitPriceEur: e.target.value })}
          />
        </div>
      </div>
      <LineTotal
        quantity={m.quantity}
        unitPriceEur={m.unitPriceEur}
        excluded={m.excludeFromInvoice}
        vatLabel={formatVatRate(reducedVatRate)}
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={m.excludeFromInvoice}
          onChange={(e) => onChange(m.id, { excludeFromInvoice: e.target.checked })}
          className="rounded border"
        />
        Achat direct fournisseur (exclure de ma facture)
      </label>
    </div>
  );
});

const MaterialRowEditor = React.memo(function MaterialRowEditor({
  m,
  reducedVatRate,
  canRemove,
  onChange,
  onRemove,
}: {
  m: MaterialRow;
  reducedVatRate: string;
  canRemove: boolean;
  onChange: (id: string, patch: Partial<MaterialRow>) => void;
  onRemove: (id: string) => void;
}) {
  const vatFranchiseCtx = React.useContext(VatFranchiseContext);
  return (
    <div className="rounded-xl border bg-muted/20 p-4 space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <Label>Désignation</Label>
          <WorkItemCombobox
            value={m.label}
            onSelect={(item) => {
              onChange(m.id, {
                label: item.title,
                description: item.description ?? "",
                unit: item.unit,
                unitPriceEur: String(item.unit_price_ht).replace(".", ","),
                // 20 % = taux par défaut de la bibliothèque : on suit la TVA du devis.
                vatRate: Number(item.default_vat_rate) === 20 ? "" : String(item.default_vat_rate),
              });
            }}
          />
        </div>
        <div className="space-y-2">
          <Label>Description</Label>
          <Input
            value={m.description}
            placeholder="Détail technique (facultatif)"
            onChange={(e) => onChange(m.id, { description: e.target.value })}
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-2">
          <Label>Unité</Label>
          <select
            className="flex h-10 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none"
            value={m.unit}
            onChange={(e) => onChange(m.id, { unit: e.target.value })}
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
              onChange(m.id, { quantity: Number.isFinite(v) ? v : 1 });
            }}
          />
        </div>
        <div className="space-y-2">
          <Label>
            Prix unit. HT (€){" "}
            {m.excludeFromInvoice && <span className="font-normal text-muted-foreground">— facultatif</span>}
          </Label>
          <Input
            inputMode="decimal"
            placeholder={m.excludeFromInvoice ? "Indicatif" : "Ex. 12,50"}
            value={m.unitPriceEur}
            onChange={(e) => onChange(m.id, { unitPriceEur: e.target.value })}
          />
        </div>
{vatFranchiseCtx ? null : (
        <div className="space-y-2">
          <Label>TVA</Label>
          <select
            className="flex h-10 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none"
            value={m.vatRate}
            onChange={(e) => onChange(m.id, { vatRate: e.target.value })}
          >
            <option value="">Comme le devis ({formatVatRate(reducedVatRate)})</option>
            <option value="20">20 % (autre taux)</option>
            <option value="10">10 % (autre taux)</option>
            <option value="5.5">5,5 % (autre taux)</option>
          </select>
        </div>
        )}
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
                default_vat_rate: Number((m.vatRate || reducedVatRate).replace(",", ".")) || 20,
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

      <LineTotal
        quantity={m.quantity}
        unitPriceEur={m.unitPriceEur}
        excluded={m.excludeFromInvoice}
        vatLabel={formatVatRate(m.vatRate || reducedVatRate)}
        vatOverridden={!!m.vatRate && !sameVatRate(m.vatRate, reducedVatRate)}
      />

      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={m.excludeFromInvoice}
            onChange={(e) => onChange(m.id, { excludeFromInvoice: e.target.checked })}
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
                onChange={(e) => onChange(m.id, { supplierUrl: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Référence</Label>
              <Input
                placeholder="Ex. 1234567"
                value={m.supplierSku}
                onChange={(e) => onChange(m.id, { supplierSku: e.target.value })}
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
          onClick={() => onRemove(m.id)}
          disabled={!canRemove}
        >
          <Trash2 className="mr-1 h-4 w-4" />
          Retirer
        </Button>
      </div>
    </div>
  );
});
