import { z } from "zod";

import type { AiQuoteDraft, AiSupplierMaterialDraft } from "@/lib/ai/quote-draft-storage";
import { formatEuros } from "@/lib/format/money";

/**
 * Correction vocale d'un devis pré-rempli : le LLM ne réécrit JAMAIS le devis.
 * Il produit une liste d'opérations ciblées ; ce module les applique de façon
 * déterministe. Les lignes non visées sont recopiées à l'identique.
 * Les totaux ne viennent jamais du LLM : ils sont recalculés par computeDraftTotals.
 */

const PATCH_OPS = [
  "add_material",
  "update_material",
  "remove_material",
  "set_labor_total",
  "set_labor_hours",
  "append_note",
] as const;

export const patchOperationSchema = z.object({
  op: z.enum(PATCH_OPS),
  /** Référence d'une ligne existante (L1, L2…) pour update/remove. */
  target: z.string().nullable(),
  label: z.string().nullable(),
  quantity: z.number().nullable(),
  unit_price_eur: z.number().nullable(),
  amount_eur: z.number().nullable(),
  hours: z.number().nullable(),
  text: z.string().nullable(),
});

export const quotePatchSchema = z.object({
  operations: z.array(patchOperationSchema).max(15),
  unresolved: z.array(z.string()).max(5),
});

export type PatchOperation = z.infer<typeof patchOperationSchema>;
export type QuotePatch = z.infer<typeof quotePatchSchema>;

const nullable = (type: string) => ({ type: [type, "null"] });

export const QUOTE_PATCH_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["operations", "unresolved"],
  properties: {
    operations: {
      type: "array",
      maxItems: 15,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["op", "target", "label", "quantity", "unit_price_eur", "amount_eur", "hours", "text"],
        properties: {
          op: { type: "string", enum: [...PATCH_OPS] },
          target: nullable("string"),
          label: nullable("string"),
          quantity: nullable("number"),
          unit_price_eur: nullable("number"),
          amount_eur: nullable("number"),
          hours: nullable("number"),
          text: nullable("string"),
        },
      },
    },
    unresolved: { type: "array", maxItems: 5, items: { type: "string" } },
  },
} as const;

export const QUOTE_PATCH_SYSTEM_PROMPT = `Tu modifies un devis d'artisan du bâtiment à partir d'une consigne dictée sur un chantier
(transcription automatique, parfois imparfaite). Tu réponds UNIQUEMENT par le JSON du schéma.

Tu ne réécris pas le devis : tu listes les OPÉRATIONS à appliquer.
- add_material : ajouter une fourniture. label = désignation courte et claire (ex. « Sac de colle carrelage »),
  quantity = quantité DITE, unit_price_eur = prix unitaire HT DIT, sinon null (ne jamais inventer un prix).
- update_material : modifier une ligne existante. target = sa référence (L1, L2…). Ne renseigne que ce qui change
  (quantity et/ou unit_price_eur et/ou label), le reste à null.
- remove_material : supprimer une ligne. target = sa référence.
- set_labor_total : « main-d'œuvre à 400 € » → amount_eur = 400 (montant HT total de main-d'œuvre).
- set_labor_hours : « compte 6 heures de main-d'œuvre » → hours = 6.
- append_note : précision à ajouter aux observations du devis (délai, condition…) → text.

Règles :
1. Une opération par changement demandé, dans l'ordre de la consigne. Rien d'autre.
2. Ne touche JAMAIS une ligne qui n'est pas mentionnée.
3. Quantités et prix : uniquement des nombres prononcés. « deux » = 2, « une dizaine » = ambigu.
4. Montants dictés supposés HT, sauf si « TTC » est dit : dans ce cas mets la phrase dans unresolved.
5. Ligne visée ambiguë (plusieurs candidates) ou consigne incomprise → aucune opération,
   recopie la phrase dans "unresolved".
6. Tous les champs non utilisés d'une opération valent null.`;

type DraftLineRef = { ref: string; id: string; label: string; quantity: number; unitPriceEur: string };

/** Références courtes et stables (L1…) données au modèle à la place des identifiants internes. */
export function draftLineRefs(draft: Pick<AiQuoteDraft, "supplierMaterials">): DraftLineRef[] {
  return (draft.supplierMaterials ?? []).map((m, i) => ({
    ref: `L${i + 1}`,
    id: m.id,
    label: m.label,
    quantity: m.quantity,
    unitPriceEur: m.unitPriceEur,
  }));
}

function eurString(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

type ApplyResult = {
  draft: AiQuoteDraft;
  changes: string[];
  warnings: string[];
};

/**
 * Applique les opérations validées. Toute opération invalide est ignorée et
 * signalée (warning) — jamais appliquée « au mieux ».
 */
export function applyQuotePatch(
  draft: AiQuoteDraft,
  patch: QuotePatch,
  opts: { newId: () => string; laborRatePerHourCents: number | null; currentLaborTotalCents: number | null },
): ApplyResult {
  const refs = new Map(draftLineRefs(draft).map((r) => [r.ref.toUpperCase(), r.id]));
  let materials: AiSupplierMaterialDraft[] = [...(draft.supplierMaterials ?? [])];
  let laborDurationMinutes = draft.laborDurationMinutes;
  let laborTotalOverrideCents = draft.laborTotalOverrideCents ?? null;
  let notes = draft.notes ?? "";
  const changes: string[] = [];
  const warnings: string[] = [];

  const findIndex = (target: string | null) => {
    const id = target ? refs.get(target.trim().toUpperCase()) : undefined;
    return id ? materials.findIndex((m) => m.id === id) : -1;
  };
  const validQty = (q: number | null): q is number => q !== null && Number.isFinite(q) && q > 0 && q <= 10_000;
  const validPrice = (p: number | null): p is number => p !== null && Number.isFinite(p) && p >= 0 && p <= 100_000;

  for (const op of patch.operations) {
    switch (op.op) {
      case "add_material": {
        const label = op.label?.trim().replace(/\s+/g, " ") ?? "";
        if (label.length < 2 || label.length > 120) {
          warnings.push("Ajout ignoré : désignation incomprise.");
          break;
        }
        const quantity = validQty(op.quantity) ? op.quantity : 1;
        if (!validQty(op.quantity)) warnings.push(`« ${label} » : quantité non comprise, 1 par défaut.`);
        const price = validPrice(op.unit_price_eur) ? op.unit_price_eur : null;
        if (price === null) warnings.push(`« ${label} » : prix à compléter.`);
        materials.push({
          id: opts.newId(),
          label,
          quantity,
          unitPriceEur: eurString(price ?? 0),
          supplierProductId: null,
          supplierUrl: null,
          supplierSku: null,
          excludeFromInvoice: false,
          similarity: null,
          requestedName: label,
          specifications: null,
        });
        changes.push(`+ ${quantity} × ${label}${price !== null ? ` à ${formatEuros(price)} HT` : " (prix à compléter)"}`);
        break;
      }
      case "update_material": {
        const i = findIndex(op.target);
        if (i < 0) {
          warnings.push(`Ligne « ${op.target ?? "?"} » introuvable : rien modifié.`);
          break;
        }
        const before = materials[i]!;
        const next = { ...before };
        const parts: string[] = [];
        if (validQty(op.quantity) && op.quantity !== before.quantity) {
          parts.push(`quantité ${before.quantity} → ${op.quantity}`);
          next.quantity = op.quantity;
        }
        if (validPrice(op.unit_price_eur) && eurString(op.unit_price_eur) !== before.unitPriceEur) {
          parts.push(`prix ${formatEuros(Number(before.unitPriceEur))} → ${formatEuros(op.unit_price_eur)} HT`);
          next.unitPriceEur = eurString(op.unit_price_eur);
        }
        const label = op.label?.trim();
        if (label && label.length >= 2 && label.length <= 120 && label !== before.label) {
          parts.push(`libellé → « ${label} »`);
          next.label = label;
        }
        if (!parts.length) {
          warnings.push(`« ${before.label} » : modification incomprise.`);
          break;
        }
        materials = materials.map((m, j) => (j === i ? next : m));
        changes.push(`~ ${before.label} : ${parts.join(", ")}`);
        break;
      }
      case "remove_material": {
        const i = findIndex(op.target);
        if (i < 0) {
          warnings.push(`Ligne « ${op.target ?? "?"} » introuvable : rien supprimé.`);
          break;
        }
        changes.push(`− ${materials[i]!.label}`);
        materials = materials.filter((_, j) => j !== i);
        break;
      }
      case "set_labor_total": {
        if (!validPrice(op.amount_eur)) {
          warnings.push("Montant de main-d'œuvre incompris.");
          break;
        }
        const cents = Math.round(op.amount_eur * 100);
        const before = laborTotalOverrideCents ?? opts.currentLaborTotalCents;
        laborTotalOverrideCents = cents;
        changes.push(`Main-d'œuvre : ${before !== null ? `${formatEuros(before / 100)} → ` : ""}${formatEuros(cents / 100)} HT`);
        break;
      }
      case "set_labor_hours": {
        if (op.hours === null || !Number.isFinite(op.hours) || op.hours <= 0 || op.hours > 500) {
          warnings.push("Durée de main-d'œuvre incomprise.");
          break;
        }
        const minutes = Math.round(op.hours * 60);
        changes.push(`Main-d'œuvre : ${Math.round((laborDurationMinutes / 60) * 100) / 100} h → ${op.hours} h`);
        laborDurationMinutes = minutes;
        // Une durée dictée remet le calcul au taux horaire (sauf montant dicté dans la même consigne, appliqué après).
        laborTotalOverrideCents = null;
        break;
      }
      case "append_note": {
        const text = op.text?.trim();
        if (!text || text.length > 500) break;
        notes = notes ? `${notes}\n${text}` : text;
        changes.push(`Observation : « ${text} »`);
        break;
      }
    }
  }

  for (const u of patch.unresolved) warnings.push(`Non compris : « ${u.slice(0, 120)} »`);

  const { previous: _dropped, ...snapshot } = draft;
  void _dropped;
  return {
    draft: {
      ...draft,
      supplierMaterials: materials,
      laborDurationMinutes,
      laborTotalOverrideCents,
      notes,
      previous: changes.length ? snapshot : (draft.previous ?? null),
    },
    changes,
    warnings,
  };
}
