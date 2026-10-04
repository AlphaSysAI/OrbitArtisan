import { z } from "zod";

import recipesJson from "@/lib/data/work-recipes.json";
import type { MaterialTakeoff } from "@/lib/ai/quote-material-takeoff";
import { ceilTo, isDiscreteUnit } from "@/lib/quotes/material-quantity";

/**
 * Matrice d'ouvrages déterministe : l'IA choisit la recette et extrait la quantité,
 * le code applique les ratios (fournitures, heures, phases). Aucune quantité inventée.
 */

const RecipeMaterialSchema = z
  .object({
    name_generic: z.string().min(2),
    /** Quantité par unité d'ouvrage (proportionnelle à Q). */
    ratio: z.number().positive().optional(),
    /** Forfait par chantier, indépendant de Q (ex. 1 protection de trappe). Exclusif de `ratio`. */
    fixed_quantity: z.number().positive().optional(),
    unit: z.string().min(1),
    specifications: z.string().nullable(),
    /** Prix moyen HT d'achat (€ par unité de la ligne), barème indicatif de la bibliothèque. */
    reference_price_ht_eur: z.number().positive().optional(),
  })
  .refine((m) => (m.ratio === undefined) !== (m.fixed_quantity === undefined), {
    message: "ratio XOR fixed_quantity",
  });

const RecipeLaborPhaseSchema = z.object({
  title: z.string().min(2),
  share: z.number().positive().max(1),
});

const WorkRecipeSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  category: z.string(),
  title: z.string(),
  unit: z.string(),
  labor_hours_per_unit: z.number().positive(),
  // Vide autorisé : ouvrage de main-d'œuvre seule (ex. fouilles à la mini-pelle).
  materials_per_unit: z.array(RecipeMaterialSchema),
  labor_phases: z.array(RecipeLaborPhaseSchema).min(1),
});

export type RecipeMaterial = z.infer<typeof RecipeMaterialSchema>;
export type RecipeLaborPhase = z.infer<typeof RecipeLaborPhaseSchema>;
export type WorkRecipe = z.infer<typeof WorkRecipeSchema>;

/** Phase de main-d'œuvre chiffrée (heures) issue d'une recette. */
export type RecipeLaborPhaseHours = { title: string; hours: number };

export type RecipeTakeoff = MaterialTakeoff & {
  labor_phases: RecipeLaborPhaseHours[];
};

/** Validée au chargement : une recette mal saisie (part, ratio, id) casse le build, pas un devis. */
const RECIPES: Record<string, WorkRecipe> = z
  .object({ recipes: z.record(z.string(), WorkRecipeSchema) })
  .parse(recipesJson).recipes;

/** Garde-fou : au-delà, la quantité extraite est jugée aberrante → repli génératif. */
export const MAX_RECIPE_QUANTITY = 5000;

export function listWorkRecipes(): WorkRecipe[] {
  return Object.values(RECIPES);
}

export function findWorkRecipe(
  id: string | null | undefined,
): WorkRecipe | null {
  if (!id) return null;
  return RECIPES[id.trim()] ?? null;
}

/** Catalogue compact injecté dans le prompt de métré. */
export function formatRecipesForPrompt(): string {
  return listWorkRecipes()
    .map((r) => `- ${r.id} : ${r.title} (quantité en ${r.unit})`)
    .join("\n");
}

/**
 * Métré déterministe : Q × ratios. Fournitures arrondies au centième supérieur
 * (entier supérieur pour les unités discrètes), heures arrondies au dixième,
 * phases réparties selon `share` avec l'écart d'arrondi sur la dernière.
 */
export function calculateTakeoffFromRecipe(
  recipeId: string,
  quantity: number,
): RecipeTakeoff {
  const recipe = findWorkRecipe(recipeId);
  if (!recipe) throw new Error(`unknown_recipe:${recipeId}`);
  if (
    !Number.isFinite(quantity) ||
    quantity <= 0 ||
    quantity > MAX_RECIPE_QUANTITY
  ) {
    throw new Error("invalid_recipe_quantity");
  }

  const materials = recipe.materials_per_unit.map((m) => {
    const raw = m.fixed_quantity ?? quantity * m.ratio!;
    return {
      name_generic: m.name_generic,
      quantity: isDiscreteUnit(m.unit) ? Math.ceil(ceilTo(raw, 2)) : ceilTo(raw, 2),
      unit: m.unit,
      specifications: m.specifications,
    };
  });

  const laborHours =
    Math.round(
      Number((quantity * recipe.labor_hours_per_unit * 10).toFixed(6)),
    ) / 10;
  let allocated = 0;
  const labor_phases = recipe.labor_phases.map((p, i) => {
    const last = i === recipe.labor_phases.length - 1;
    const hours = last
      ? Math.round((laborHours - allocated) * 10) / 10
      : Math.round(Number((laborHours * p.share * 10).toFixed(6))) / 10;
    allocated += hours;
    return { title: p.title, hours };
  });

  return {
    work_summary: `${recipe.title} — ${quantity} ${recipe.unit}`,
    assumptions: [
      `Recette appliquée : ${recipe.title} (${recipe.category}).`,
      `Quantité de base : ${quantity} ${recipe.unit} ; fournitures = quantité × ratio par ${recipe.unit} (chutes et recouvrements inclus dans les ratios).`,
      `Main-d'œuvre : ${quantity} ${recipe.unit} × ${recipe.labor_hours_per_unit} h/${recipe.unit} = ${laborHours} h.`,
    ],
    materials,
    masonry_wall_area_m2: null,
    labor_hours_estimate: laborHours > 0 ? laborHours : null,
    calculation_notes:
      "Métré calculé par ratios standards — quantités indicatives, à valider sur chantier.",
    matched_recipe_id: recipe.id,
    recipe_quantity: quantity,
    labor_phases,
  };
}
