import { z } from "zod";

/**
 * Modification d'un devis en cours d'édition par consigne (écrite ou dictée).
 * Le LLM ne réécrit jamais le devis : il renvoie des OPÉRATIONS ciblées, appliquées
 * ici de façon déterministe sur l'état du formulaire. Les lignes non visées sont
 * recopiées à l'identique (prix, quantités, fournisseur) : aucune nouvelle recherche
 * de prix n'est relancée pour elles. Les totaux sont recalculés par le formulaire.
 */

export type FormPatchLine = {
  id: string;
  source: "manual" | "supplier";
  label: string;
  quantity: number;
  /** Prix unitaire HT en euros, null si non renseigné. */
  unitPriceEur: number | null;
};

export type FormPatchLabor = { id: string; title: string; hours: number };

export type QuoteFormSnapshot = {
  lines: FormPatchLine[];
  labor: FormPatchLabor[];
  laborRateEur: number | null;
  notes: string;
};

export const FORM_PATCH_OPS = [
  "add_line",
  "update_line",
  "remove_line",
  "add_labor",
  "update_labor",
  "remove_labor",
  "set_labor_rate",
  "append_note",
] as const;

export const formPatchOperationSchema = z.object({
  op: z.enum(FORM_PATCH_OPS),
  /** Référence d'une ligne existante : F1, F2… (fournitures) ou M1, M2… (main-d'œuvre). */
  target: z.string().nullable(),
  label: z.string().nullable(),
  quantity: z.number().nullable(),
  unit_price_eur: z.number().nullable(),
  hours: z.number().nullable(),
  text: z.string().nullable(),
});

export const formPatchSchema = z.object({
  operations: z.array(formPatchOperationSchema).max(20),
  unresolved: z.array(z.string()).max(5),
});

export type FormPatchOperation = z.infer<typeof formPatchOperationSchema>;
export type FormPatch = z.infer<typeof formPatchSchema>;

const nullable = (type: string) => ({ type: [type, "null"] });

export const FORM_PATCH_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["operations", "unresolved"],
  properties: {
    operations: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["op", "target", "label", "quantity", "unit_price_eur", "hours", "text"],
        properties: {
          op: { type: "string", enum: [...FORM_PATCH_OPS] },
          target: nullable("string"),
          label: nullable("string"),
          quantity: nullable("number"),
          unit_price_eur: nullable("number"),
          hours: nullable("number"),
          text: nullable("string"),
        },
      },
    },
    unresolved: { type: "array", maxItems: 5, items: { type: "string" } },
  },
} as const;

export const FORM_PATCH_SYSTEM_PROMPT = `Tu modifies un devis d'artisan du bâtiment déjà rempli, à partir d'une consigne
(écrite ou dictée, parfois imparfaite). Tu réponds UNIQUEMENT par le JSON du schéma.

Tu ne réécris pas le devis : tu listes les OPÉRATIONS à appliquer.
- add_line : ajouter une fourniture. label = désignation courte (ex. « Sac de colle carrelage C2 25 kg »),
  quantity = quantité demandée, unit_price_eur = prix unitaire HT s'il est DONNÉ, sinon null (ne jamais inventer).
- update_line : modifier une fourniture existante (target = F1, F2…). Ne renseigne que ce qui change
  (label et/ou quantity et/ou unit_price_eur), le reste à null.
- remove_line : supprimer une fourniture (target = F…).
- add_labor : ajouter une ligne de main-d'œuvre (label = intitulé, hours = heures).
- update_labor : modifier une ligne de main-d'œuvre (target = M1, M2… ; label et/ou hours).
- remove_labor : supprimer une ligne de main-d'œuvre (target = M…).
- set_labor_rate : nouveau taux horaire HT (unit_price_eur = taux en €/h).
- append_note : précision à ajouter aux observations du devis (délai, condition…) → text.

Règles :
1. Une opération par changement demandé, dans l'ordre de la consigne. Rien d'autre.
2. Ne touche JAMAIS une ligne qui n'est pas visée par la consigne.
3. « Remplace X par Y » sur une fourniture = update_line (label, et prix seulement s'il est donné).
4. « Augmente de 10 % » / « double » une quantité ou un prix : calcule la nouvelle valeur à partir du devis actuel.
5. Montants supposés HT, sauf « TTC » explicite : dans ce cas divise par 1,2 (TVA 20 %) et ajoute la phrase dans unresolved
   pour que l'artisan vérifie le taux.
6. Ligne visée ambiguë (plusieurs candidates) ou consigne incomprise → aucune opération, recopie la phrase dans "unresolved".
7. Tous les champs non utilisés d'une opération valent null.`;

export function lineRef(index: number): string {
  return `F${index + 1}`;
}

export function laborRef(index: number): string {
  return `M${index + 1}`;
}

/** Contexte compact envoyé au modèle (références courtes à la place des identifiants internes). */
export function describeSnapshot(s: QuoteFormSnapshot): string {
  const fmt = (n: number | null) => (n === null ? "prix à compléter" : `${n.toFixed(2)} € HT`);
  const lines = s.lines.map((l, i) => `${lineRef(i)} | ${l.label || "(sans libellé)"} | qté ${l.quantity} | ${fmt(l.unitPriceEur)}`);
  const labor = s.labor.map((l, i) => `${laborRef(i)} | ${l.title || "(sans intitulé)"} | ${l.hours} h`);
  return [
    `Taux horaire : ${s.laborRateEur !== null ? `${s.laborRateEur} €/h HT` : "non renseigné"}`,
    "Main-d'œuvre :",
    ...(labor.length ? labor : ["(aucune)"]),
    "Fournitures :",
    ...(lines.length ? lines : ["(aucune)"]),
  ].join("\n");
}

export type FormPatchResult = {
  snapshot: QuoteFormSnapshot;
  changes: string[];
  warnings: string[];
};

const eur = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);
const round2 = (n: number) => Math.round(n * 100) / 100;
const validQty = (q: number | null): q is number => q !== null && Number.isFinite(q) && q > 0 && q <= 100_000;
const validPrice = (p: number | null): p is number => p !== null && Number.isFinite(p) && p >= 0 && p <= 1_000_000;
const validHours = (h: number | null): h is number => h !== null && Number.isFinite(h) && h > 0 && h <= 2_000;
const cleanLabel = (s: string | null) => s?.trim().replace(/\s+/g, " ") ?? "";

/**
 * Applique les opérations. Toute opération invalide est ignorée et signalée —
 * jamais appliquée « au mieux ». Les références visent l'état AVANT la consigne.
 */
export function applyFormPatch(
  input: QuoteFormSnapshot,
  patch: FormPatch,
  newId: () => string,
): FormPatchResult {
  const lineIds = new Map(input.lines.map((l, i) => [lineRef(i), l.id]));
  const laborIds = new Map(input.labor.map((l, i) => [laborRef(i), l.id]));
  let lines = [...input.lines];
  let labor = [...input.labor];
  let laborRateEur = input.laborRateEur;
  let notes = input.notes;
  const changes: string[] = [];
  const warnings: string[] = [];

  const ref = (t: string | null) => t?.trim().toUpperCase() ?? "";

  for (const op of patch.operations) {
    switch (op.op) {
      case "add_line": {
        const label = cleanLabel(op.label);
        if (label.length < 2 || label.length > 160) {
          warnings.push("Ajout ignoré : désignation incomprise.");
          break;
        }
        const quantity = validQty(op.quantity) ? op.quantity : 1;
        if (!validQty(op.quantity)) warnings.push(`« ${label} » : quantité non précisée, 1 par défaut.`);
        const price = validPrice(op.unit_price_eur) ? round2(op.unit_price_eur) : null;
        if (price === null) warnings.push(`« ${label} » : prix à compléter.`);
        lines.push({ id: newId(), source: "manual", label, quantity, unitPriceEur: price });
        changes.push(`+ ${quantity} × ${label}${price !== null ? ` à ${eur(price)} HT` : " (prix à compléter)"}`);
        break;
      }
      case "update_line": {
        const id = lineIds.get(ref(op.target));
        const i = id ? lines.findIndex((l) => l.id === id) : -1;
        if (i < 0) {
          warnings.push(`Fourniture « ${op.target ?? "?"} » introuvable : rien modifié.`);
          break;
        }
        const before = lines[i]!;
        const next = { ...before };
        const parts: string[] = [];
        const label = cleanLabel(op.label);
        if (label && label.length >= 2 && label.length <= 160 && label !== before.label) {
          parts.push(`libellé → « ${label} »`);
          next.label = label;
        }
        if (validQty(op.quantity) && op.quantity !== before.quantity) {
          parts.push(`quantité ${before.quantity} → ${op.quantity}`);
          next.quantity = op.quantity;
        }
        if (validPrice(op.unit_price_eur) && round2(op.unit_price_eur) !== before.unitPriceEur) {
          parts.push(`prix ${before.unitPriceEur !== null ? eur(before.unitPriceEur) : "—"} → ${eur(round2(op.unit_price_eur))} HT`);
          next.unitPriceEur = round2(op.unit_price_eur);
        }
        if (!parts.length) {
          warnings.push(`« ${before.label} » : modification incomprise.`);
          break;
        }
        lines = lines.map((l, j) => (j === i ? next : l));
        changes.push(`~ ${before.label} : ${parts.join(", ")}`);
        break;
      }
      case "remove_line": {
        const id = lineIds.get(ref(op.target));
        const i = id ? lines.findIndex((l) => l.id === id) : -1;
        if (i < 0) {
          warnings.push(`Fourniture « ${op.target ?? "?"} » introuvable : rien supprimé.`);
          break;
        }
        changes.push(`− ${lines[i]!.label}`);
        lines = lines.filter((_, j) => j !== i);
        break;
      }
      case "add_labor": {
        const title = cleanLabel(op.label) || "Main-d'œuvre";
        if (!validHours(op.hours)) {
          warnings.push(`« ${title} » : nombre d'heures incompris.`);
          break;
        }
        labor.push({ id: newId(), title, hours: op.hours });
        changes.push(`+ Main-d'œuvre « ${title} » : ${op.hours} h`);
        break;
      }
      case "update_labor": {
        const id = laborIds.get(ref(op.target));
        const i = id ? labor.findIndex((l) => l.id === id) : -1;
        if (i < 0) {
          warnings.push(`Main-d'œuvre « ${op.target ?? "?"} » introuvable : rien modifié.`);
          break;
        }
        const before = labor[i]!;
        const next = { ...before };
        const parts: string[] = [];
        const title = cleanLabel(op.label);
        if (title && title !== before.title && title.length <= 160) {
          parts.push(`intitulé → « ${title} »`);
          next.title = title;
        }
        if (validHours(op.hours) && op.hours !== before.hours) {
          parts.push(`${before.hours} h → ${op.hours} h`);
          next.hours = op.hours;
        }
        if (!parts.length) {
          warnings.push(`« ${before.title} » : modification incomprise.`);
          break;
        }
        labor = labor.map((l, j) => (j === i ? next : l));
        changes.push(`~ Main-d'œuvre « ${before.title} » : ${parts.join(", ")}`);
        break;
      }
      case "remove_labor": {
        const id = laborIds.get(ref(op.target));
        const i = id ? labor.findIndex((l) => l.id === id) : -1;
        if (i < 0) {
          warnings.push(`Main-d'œuvre « ${op.target ?? "?"} » introuvable : rien supprimé.`);
          break;
        }
        changes.push(`− Main-d'œuvre « ${labor[i]!.title} »`);
        labor = labor.filter((_, j) => j !== i);
        break;
      }
      case "set_labor_rate": {
        if (!validPrice(op.unit_price_eur) || op.unit_price_eur <= 0) {
          warnings.push("Taux horaire incompris.");
          break;
        }
        const rate = round2(op.unit_price_eur);
        changes.push(`Taux horaire : ${laborRateEur !== null ? `${eur(laborRateEur)} → ` : ""}${eur(rate)}/h HT`);
        laborRateEur = rate;
        break;
      }
      case "append_note": {
        const text = op.text?.trim();
        if (!text || text.length > 500) break;
        notes = notes.trim() ? `${notes.trim()}\n${text}` : text;
        changes.push(`Observation : « ${text} »`);
        break;
      }
    }
  }

  for (const u of patch.unresolved) warnings.push(`À vérifier : « ${u.slice(0, 160)} »`);

  return { snapshot: { lines, labor, laborRateEur, notes }, changes, warnings };
}
