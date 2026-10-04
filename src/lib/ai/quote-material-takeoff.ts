import "server-only";

import { z } from "zod";

import { mistralChatParse } from "@/lib/ai/mistral";
import { isMasonryUnitMaterial } from "@/lib/ai/quote-material-sanity";
import { formatWebSearchForPrompt, searchWebForQuoteContext } from "@/lib/ai/web-search";
import { estimateHouseWallDimensions, estimateRoofAreaFromFootprint, type HouseWallDimensions } from "@/lib/ai/geometry-engine";
import {
  calculateTakeoffFromRecipe,
  findWorkRecipe,
  formatRecipesForPrompt,
  MAX_RECIPE_QUANTITY,
  type RecipeLaborPhaseHours,
} from "@/lib/ai/work-recipes";

function coerceString(v: unknown): string {
  return String(v ?? "").trim();
}

function coerceNullableString(v: unknown): string | null {
  if (v == null || v === "") return null;
  return String(v).trim() || null;
}

function coerceNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(String(v ?? "").replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function coercePositiveNumber(v: unknown): number {
  return Math.max(0.01, coerceNumber(v));
}

export const MaterialTakeoffSchema = z.object({
  work_summary: z.preprocess(coerceString, z.string()),
  assumptions: z.preprocess(
    (v) => (Array.isArray(v) ? v.map((x) => String(x ?? "").trim()).filter(Boolean) : []),
    z.array(z.string()),
  ),
  materials: z.preprocess(
    (v) => (Array.isArray(v) ? v : []),
    z.array(
      z.object({
        name_generic: z.preprocess(coerceString, z.string()),
        quantity: z.preprocess(coercePositiveNumber, z.number().positive()),
        unit: z.preprocess(coerceString, z.string()),
        specifications: z.preprocess(coerceNullableString, z.string().nullable()),
      }),
    ),
  ),
  /**
   * Surface totale de murs porteurs à monter en parpaings/agglos (m²), quand le
   * chantier en nécessite. Le LLM ne doit PAS calculer lui-même le nombre de blocs
   * (chaîne de calcul — surface × ratio — qu'il rate régulièrement d'un facteur 10,
   * cf. quote-material-sanity.ts) : il estime uniquement cette surface, ratio
   * appliqué en code dans computeMasonryBlockCount().
   */
  masonry_wall_area_m2: z.preprocess(
    (v) => {
      if (v == null || v === "") return null;
      const n = coerceNumber(v);
      return n > 0 ? n : null;
    },
    z.number().positive().nullable(),
  ),
  labor_hours_estimate: z.preprocess(
    (v) => {
      if (v == null || v === "") return null;
      const n = coerceNumber(v);
      return n > 0 ? n : null;
    },
    z.number().positive().nullable(),
  ),
  calculation_notes: z.preprocess(coerceString, z.string()),
  /** Recette de la matrice d'ouvrages reconnue par le modèle (null = métré génératif). */
  matched_recipe_id: z
    .preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : null), z.string().nullable())
    .optional(),
  /** Quantité de base dans l'unité de la recette (m² de toiture, de mur, de surface développée…). */
  recipe_quantity: z
    .preprocess((v) => {
      if (v == null || v === "") return null;
      const n = coerceNumber(v);
      return n > 0 ? n : null;
    }, z.number().positive().nullable())
    .optional(),
});

export type MaterialTakeoff = z.infer<typeof MaterialTakeoffSchema>;

const MATERIAL_TAKEOFF_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    work_summary: { type: "string" },
    assumptions: { type: "array", items: { type: "string" } },
    materials: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name_generic: { type: "string" },
          quantity: { type: "number" },
          unit: { type: "string", description: "U, sacs, m³, L, kg…" },
          specifications: { type: "string" },
        },
        required: ["name_generic", "quantity", "unit"],
      },
    },
    masonry_wall_area_m2: {
      type: ["number", "null"],
      description:
        "Surface totale des murs porteurs à monter en parpaings/agglos (m²), si le chantier en nécessite. " +
        "Null sinon. Ne calcule PAS toi-même le nombre de blocs à partir de cette surface : ne liste " +
        "AUCUN parpaing/agglo dans materials, indique juste la surface ici, le nombre de blocs est calculé " +
        "automatiquement à partir de ce champ.",
    },
    labor_hours_estimate: { type: "number", description: "Heures MO estimées" },
    calculation_notes: { type: "string" },
    matched_recipe_id: {
      type: ["string", "null"],
      description: "Identifiant exact d'une recette de la matrice si la demande correspond à UN seul ouvrage couvert, sinon null.",
    },
    recipe_quantity: {
      type: ["number", "null"],
      description: "Quantité de base dans l'unité de la recette (ex. m² de toiture), sinon null.",
    },
  },
  required: ["work_summary", "assumptions", "materials", "calculation_notes"],
};

/**
 * Ratio standard BTP France pour un parpaing/agglo 20×20×50 cm : 2 blocs/m de large
 * × 5 blocs/m de haut = 10 blocs/m² de mur (source : pratique courante du métier).
 * Marge de chute : 5 %, cohérent avec le reste du métré (arrondi supérieur).
 * Constantes volontairement isolées et documentées : à ajuster si l'artisan utilise
 * un autre format de bloc.
 */
export const MASONRY_BLOCKS_PER_M2 = 10;
const MASONRY_WASTE_MARGIN = 0.05;

/** Calcule un nombre de parpaings/agglos de façon déterministe — jamais via le LLM. */
export function computeMasonryBlockCount(wallAreaM2: number): number {
  return Math.ceil(wallAreaM2 * MASONRY_BLOCKS_PER_M2 * (1 + MASONRY_WASTE_MARGIN));
}

/** Minuscules, sans accents ni exposants (m² → m2, œ → oe) : les regex ci-dessous travaillent sur ce texte. */
function foldForDetection(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/[’`]/g, "'");
}

/** Gros œuvre / couverture / VRD : métré dès qu'une dimension chiffrée est donnée. */
const STRUCTURAL_WORK =
  /mur|parpaing|agglo|brique|bloc|dalle|chape|\btoit|charpente|couverture|tuile|carrelage|enduit|cloison|fondation|terrasse|terrassement|maconnerie|beton|linteau|poteau|hourdis|planelle|plancher/;

/** Second œuvre et formulations de particuliers : métré si dimension OU surface / pièce identifiable. */
const FINISHING_WORK = new RegExp(
  [
    // Peinture / finitions
    "peinture", "peindre", "tapisserie", "toile de verre", "enduit", "lissage", "\\bmurs\\b", "plafond",
    // Plâtrerie / isolation
    "placo", "\\bba ?13\\b", "cloison", "doublage", "laine de (?:verre|roche)", "isolant", "isolation", "combles",
    // Sols
    "carrelage", "faience", "parquet", "stratifie", "sol pvc", "\\blino", "chape", "ragreage",
    // Électricité
    "tableau electrique", "pieuvre", "remise aux normes", "renovation electrique", "cablage", "\\bprises\\b",
    // Plomberie / sanitaire
    "salle de bains?", "douche", "\\breseau", "alimentation", "evacuation", "multicouche", "\\bper\\b",
    "chauffe-eau", "cumulus", "tuyauterie", "tuyaux",
    // Extérieur / menuiserie
    "terrasse", "bardage", "cloture", "\\bdalle",
    // Langage profane
    "refaire (?:le toit|la toiture)", "renover", "agrandissement", "extension", "separer une piece",
  ].join("|"),
);

/** Dimension chiffrée : 135 m2, 12ml, 2,5 m, 80 cm, 10 x 2, 10 m lin… */
const NUMERIC_DIMENSION =
  /\d+(?:[.,]\d+)?\s*(?:m[23l]?|cm|mm|metres?|meters?)\b|\d+(?:[.,]\d+)?\s*[x×*]\s*\d+|\d+(?:[.,]\d+)?\s*m\s*lin/;

/** Grandeur sans chiffre exploitable directement : unité citée, cote, pièce ou logement entier. */
const SIZE_HINT =
  /\b(?:m2|m3|ml|metres?|surface|longueur|largeur|hauteur|pans?|mesures?|chambres?|salon|sejour|maison|appartement|pieces?|complete?s?|totale?s?|entiere?s?)\b/;

/** Dépannage unitaire : pas de métré (quota Tavily / Mistral, latence), sauf dimension chiffrée explicite. */
const UNIT_REPAIR =
  /recherche de fuite|\bfuite\b|\bfuit\b|debouch|depann|\ben panne\b|ne (?:marche|fonctionne) plus|(?:remplace|change)\w*\s+(?:(?:de |d'|du |le |la |les |l'|un |une |mon |ma |mes )\s*)*(?:mitigeur|robinet|wc|toilettes?|chasse d'eau|joint|ballon|chauffe-eau|cumulus|disjoncteur|differentiel|prise|interrupteur|serrure|vitre|ampoule|tuile|siphon)/;

/** Chantier global sans métré explicite (maison neuve, gros œuvre…). */
export function isWholeHouseMasonryProject(instruction: string): boolean {
  return /maison\s+neuve|construction\s+(d[''])?une\s+maison|maison\s+individuelle|gros\s+[œoe]uvre|murs?\s+porteurs?|charpente\s+traditionnelle/i.test(
    instruction,
  );
}

/** Matériau de maçonnerie demandé : la brique citée l'emporte toujours ; parpaing par défaut. */
export type MasonryMaterial = "brique" | "parpaing";

const MASONRY_RECIPE_BY_MATERIAL: Record<MasonryMaterial, string> = {
  brique: "maconnerie_mur_brique_20",
  parpaing: "maconnerie_mur_parpaing_20",
};
const MASONRY_RECIPE_IDS = new Set(Object.values(MASONRY_RECIPE_BY_MATERIAL));

export function detectMasonryMaterial(instruction: string): MasonryMaterial | null {
  const text = foldForDetection(instruction);
  if (/\bbriques?\b|monomur|optibric|calibric|thermo-?briques?/.test(text)) return "brique";
  if (/parpaing|\bagglos?\b|blocs? (?:beton|creux)/.test(text)) return "parpaing";
  return null;
}

/** Étage : R+1, « à étage », « sur 2 niveaux »… (texte replié, sans accents). */
const TWO_STOREY_RE = /\br\s*\+\s*1\b|\betages?\b|\b1 etage\b|(?:sur )?(?:2|deux) niveaux/;

export type HouseFloorArea = {
  floorAreaM2: number;
  /** Emprise au sol : S en plain-pied, S/2 avec étage ou combles aménagés. */
  footprintM2: number;
  levels: 1 | 2;
  /** Second niveau en combles aménagés (et non un étage plein). */
  atticRooms: boolean;
};

/**
 * Surface de plancher d'une maison citée dans la demande (« maison neuve 130m2 »,
 * « 130 m2 au sol / au plancher », « surface habitable de 130 m² »). Avec étage
 * (R+1), l'emprise au sol vaut la moitié et les murs font deux niveaux.
 */
export function extractHouseFloorArea(
  instruction: string,
): HouseFloorArea | null {
  const text = foldForDetection(instruction);
  const num = (v: string) => Number(v.replace(",", "."));
  const patterns = [
    /(\d+(?:[.,]\d+)?)\s*m2\s*(?:au sol|au plancher|de plancher|habitables?|d'emprise|d'emprise au sol)/,
    /(?:surface|emprise)\s*(?:au sol|habitable|de plancher|au plancher)?\s*(?:de|:)?\s*(\d+(?:[.,]\d+)?)\s*m2/,
    /(?:maison|pavillon|plain-pied|villa)[^.;]{0,40}?(\d+(?:[.,]\d+)?)\s*m2/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const floorAreaM2 = num(m[1]!);
    if (!(floorAreaM2 >= 20 && floorAreaM2 <= 1000)) continue;
    const atticRooms = /combles? amenage/.test(text);
    const twoStorey = !/plain-?pied/.test(text) && (atticRooms || TWO_STOREY_RE.test(text));
    const levels: 1 | 2 = twoStorey ? 2 : 1;
    return {
      floorAreaM2,
      footprintM2: Math.round((floorAreaM2 / levels) * 10) / 10,
      levels,
      atticRooms: twoStorey && atticRooms && !TWO_STOREY_RE.test(text),
    };
  }
  return null;
}

/** Hauteur de maçonnerie de façade par niveau. */
const WALL_HEIGHT_PER_LEVEL = 2.5;
/** Combles aménagés : murs du RDC + jambettes (~1 m), pas un second niveau plein. */
const ATTIC_KNEE_WALL_HEIGHT = 1;

/** Facade height used for exterior walls: 2,50 m (R+0), 5,00 m (R+1), 3,50 m (combles aménagés). */
function facadeHeight(house: HouseFloorArea): number {
  if (house.levels === 1) return WALL_HEIGHT_PER_LEVEL;
  return house.atticRooms ? WALL_HEIGHT_PER_LEVEL + ATTIC_KNEE_WALL_HEIGHT : 2 * WALL_HEIGHT_PER_LEVEL;
}

type GeometryContext = {
  house: HouseFloorArea | null;
  walls: (HouseWallDimensions & { material: MasonryMaterial; heightM: number }) | null;
  roofAreaM2: number | null;
  material: MasonryMaterial | null;
  /** Maison neuve / gros œuvre pour un maçon (ou un particulier) : fouilles, semelles, dallage, murs chaînés. */
  structuralShell: boolean;
  /** La demande nomme d'autres lots que le gros œuvre (toiture, menuiseries, enduit…). */
  extraLots: boolean;
};

/**
 * Géométrie calculée AVANT l'appel au modèle : il reçoit les surfaces, il ne les
 * invente pas. Murs : demande de maçonnerie / gros œuvre (ou maison neuve pour un
 * maçon ou un particulier). Toiture : demande de toiture (ou maison neuve pour un
 * couvreur ou un particulier). Une surface de toiture déjà chiffrée n'est pas recalculée.
 */
export function buildGeometryContext(instruction: string, scope: TakeoffScope): GeometryContext {
  const material = detectMasonryMaterial(instruction);
  const house = extractHouseFloorArea(instruction);
  if (!house) {
    return { house: null, walls: null, roofAreaM2: null, material, structuralShell: false, extraLots: false };
  }

  const text = foldForDetection(instruction);
  const trade = scope.audience === "artisan" ? foldForDetection(scope.tradeLabel ?? "") : "";
  const globalProject = /maison neuve|construction|gros oeuvre|extension|agrandissement/.test(text);
  const masonryTrade = scope.audience === "client" || /macon|gros oeuvre|beton/.test(trade);
  const roofTrade = scope.audience === "client" || /couvr|charpent|couverture|toiture/.test(trade);

  const wallsWanted =
    /\bmurs?\b|maconnerie|elevation|parpaing|briques?|agglo|gros oeuvre/.test(text) || (globalProject && masonryTrade);
  const roofExplicitArea = /\d+(?:[.,]\d+)?\s*m2\s*(?:de\s*)?(?:toiture|toit|couverture)/.test(text);
  const roofWanted =
    !roofExplicitArea && (/\btoit|toiture|charpente|couverture/.test(text) || (globalProject && roofTrade));

  const heightM = facadeHeight(house);
  const structuralShell = wallsWanted && masonryTrade && /maison neuve|construction|gros oeuvre/.test(text);
  return {
    house,
    material,
    structuralShell,
    extraLots: EXTRA_LOTS_RE.test(text),
    walls: wallsWanted
      ? { ...estimateHouseWallDimensions(house.footprintM2, heightM), material: material ?? "parpaing", heightM }
      : null,
    roofAreaM2: roofWanted ? estimateRoofAreaFromFootprint(house.footprintM2) : null,
  };
}

/** Lots hors gros œuvre nommés dans la demande : seuls cas où le modèle est encore consulté. */
const EXTRA_LOTS_RE =
  /charpente|toiture|\btoit\b|couverture|zinguerie|gouttiere|menuiser|fenetre|\bportes?\b|enduit|facade|ravalement|placo|plaquiste|cloison|doublage|isolation|combles|plomberie|sanitaire|electri|carrelage|faience|parquet|peinture|chape|terrasse|vide sanitaire|plancher (?:haut|d'etage|etage)|escalier|assainissement|vrd/;

/** Fournitures déjà couvertes par le gros œuvre calculé : retirées du métré du modèle. */
const SHELL_COMPLEX_RE =
  /fouille|semelle|dallage|polyane|sous dallage|treillis|poutrelle|hourdis|entrevous|planelle|beton pret|beton c\d|\bbeton\b(?!.*(?:terrasse|escalier|appui))/;

/** Gros œuvre chaîné : 4 recettes sur la géométrie calculée, fournitures fusionnées. */
export function computeHouseStructuralShell(ctx: GeometryContext): {
  materials: MaterialTakeoff["materials"];
  laborPhases: RecipeLaborPhaseHours[];
  laborHours: number;
  assumptions: string[];
} | null {
  if (!ctx.structuralShell || !ctx.house || !ctx.walls) return null;
  const perimeter = ctx.walls.perimeterLinearMeters;
  const steps: [string, number, string][] = [
    ["terrassement_fouilles_rigoles", perimeter, `${perimeter} ml (périmètre)`],
    ["fondations_semelles_filantes_beton_arme", perimeter, `${perimeter} ml (périmètre)`],
    ["dallage_beton_sur_terre_plein", ctx.house.footprintM2, `${ctx.house.footprintM2} m² (emprise)`],
    ...(ctx.house.levels === 2
      ? ([["plancher_intermediaire_poutrelles_hourdis", ctx.house.footprintM2, `${ctx.house.footprintM2} m² (plancher d'étage)`]] as [
          string,
          number,
          string,
        ][])
      : []),
    [MASONRY_RECIPE_BY_MATERIAL[ctx.walls.material], ctx.walls.netWallAreaM2, `${ctx.walls.netWallAreaM2} m² nets`],
  ];
  const merged = new Map<string, MaterialTakeoff["materials"][number]>();
  const laborPhases: RecipeLaborPhaseHours[] = [];
  const assumptions: string[] = [];
  let laborHours = 0;
  for (const [recipeId, quantity, basis] of steps) {
    const recipe = findWorkRecipe(recipeId);
    if (!recipe || !(quantity > 0)) continue;
    const part = calculateTakeoffFromRecipe(recipeId, quantity);
    for (const m of part.materials) {
      // Même article, même unité (ex. béton de deux recettes) : quantités cumulées.
      // Les libellés communs sont normalisés dans work-recipes.json (béton : « C25/30 en toupie »).
      const key = `${m.name_generic}|${m.unit}`;
      const prev = merged.get(key);
      merged.set(
        key,
        prev
          ? {
              ...prev,
              quantity: Math.round(Number(((prev.quantity + m.quantity) * 100).toFixed(6))) / 100,
              specifications: mergeSpecifications(prev.specifications, m.specifications),
            }
          : m,
      );
    }
    laborPhases.push(...part.labor_phases);
    laborHours += part.labor_hours_estimate ?? 0;
    assumptions.push(`${recipe.title} : ${basis} × ${recipe.labor_hours_per_unit} h/${recipe.unit}.`);
  }
  if (!laborPhases.length) return null;
  return { materials: [...merged.values()], laborPhases, laborHours: Math.round(laborHours * 10) / 10, assumptions };
}

/** Usages distincts d'une fourniture fusionnée (« Semelles… · Dallage… · Chaînages… »). */
function mergeSpecifications(a: string | null, b: string | null): string | null {
  const parts = [a, b].filter((s): s is string => !!s?.trim());
  if (parts.length === 0) return null;
  return [...new Set(parts.join(" · ").split(" · "))].join(" · ");
}

function geometryPromptBlock(ctx: GeometryContext): string | null {
  const lines: string[] = [];
  if (ctx.material === "brique") {
    lines.push("Matériau de maçonnerie IMPOSÉ : brique (demandée explicitement). N'utilise JAMAIS de parpaing ni d'agglo.");
  }
  if (ctx.structuralShell && ctx.walls && ctx.house) {
    lines.push(
      `Gros œuvre (fouilles en rigoles, semelles filantes, dallage sur terre-plein, murs en ${ctx.walls.material} chaînés) : chiffré AUTOMATIQUEMENT sur ${ctx.walls.perimeterLinearMeters} ml de périmètre, ${ctx.house.footprintM2} m² d'emprise et ${ctx.walls.netWallAreaM2} m² de murs nets. Ne liste AUCUNE de ces fournitures, "masonry_wall_area_m2" = null, "matched_recipe_id" = null, et "labor_hours_estimate" = heures des AUTRES lots demandés uniquement.`,
    );
  } else if (ctx.walls && ctx.house) {
    const w = ctx.walls;
    lines.push(
      `Murs extérieurs (calculés, ne recalcule rien) : emprise ${ctx.house.footprintM2} m², périmètre ${w.perimeterLinearMeters} ml, hauteur ${w.heightM} m, surface brute ${w.grossWallAreaM2} m², ouvertures ${w.openingsAreaM2} m², surface nette ${w.netWallAreaM2} m².`,
      `Ces murs en ${w.material} sont chiffrés AUTOMATIQUEMENT (blocs, mortier ou colle de montage, arase, chaînages, linteaux, béton de chaînage) : ne les liste PAS dans "materials", "masonry_wall_area_m2" = null, "matched_recipe_id" = null, et "labor_hours_estimate" = heures HORS élévation de ces murs.`,
    );
  }
  if (ctx.roofAreaM2) {
    lines.push(
      `Surface de toiture développée (calculée : emprise × débords 12 % × pente 35 %) : ${ctx.roofAreaM2} m². C'est la quantité à utiliser pour la toiture, ne la recalcule pas.`,
    );
  }
  return lines.length ? `DONNÉES GÉOMÉTRIQUES IMPOSÉES :\n${lines.map((l) => `- ${l}`).join("\n")}` : null;
}

/** Libellé normalisé d'un matériau, pour les filtres de cohérence. */
function foldName(name: string): string {
  return foldForDetection(name);
}

/** Composants d'un mur maçonné (déjà fournis par la recette) : à retirer du métré du modèle. */
const WALL_COMPLEX_RE =
  /parpaing|\bagglos?\b|\bbriques?\b|blocs? (?:beton|creux)|\barase\b|chainage|linteau|mortier[- ]colle|mortier de montage/;

/**
 * DTU 20.1 : les chaînages se font en armatures HA (4 filants), jamais en treillis
 * soudé (réservé aux dallages). Toute ligne « treillis … chaînage » est retirée.
 */
function dropMeshForTieBeams(materials: MaterialTakeoff["materials"]): {
  materials: MaterialTakeoff["materials"];
  dropped: boolean;
} {
  const kept = materials.filter((m) => {
    const n = foldName(`${m.name_generic} ${m.specifications ?? ""}`);
    return !(/treillis/.test(n) && /chainage|poteau|raidisseur|linteau/.test(n));
  });
  return { materials: kept, dropped: kept.length !== materials.length };
}

/**
 * Métré automatique utile ? (appel Tavily + Mistral : réservé aux projets quantifiables)
 * - dépannage unitaire sans dimension chiffrée → non ;
 * - gros œuvre / couverture → si dimension chiffrée ou maison entière ;
 * - second œuvre → si dimension chiffrée, surface citée ou pièce / logement identifié.
 */
export function needsMaterialTakeoff(instruction: string): boolean {
  const raw = instruction.trim();
  if (raw.length < 12) return false;
  const text = foldForDetection(raw);

  const hasNumericDimension = NUMERIC_DIMENSION.test(text);
  if (UNIT_REPAIR.test(text) && !hasNumericDimension) return false;

  if (STRUCTURAL_WORK.test(text) && (hasNumericDimension || isWholeHouseMasonryProject(raw))) return true;

  return FINISHING_WORK.test(text) && (hasNumericDimension || SIZE_HINT.test(text));
}

function takeoffAssumptionHint(instruction: string): string | null {
  if (!isWholeHouseMasonryProject(instruction)) return null;
  if (/\d+[,.]?\d*\s*m(?:²|2)\b/i.test(instruction)) return null;

  return (
    "Surface du projet non précisée dans la description : formule des hypothèses dimensionnelles " +
    "dans assumptions avant de chiffrer, et indique qu'elles sont à valider sur chantier."
  );
}

function buildWebSearchQuery(instruction: string): string {
  const compact = instruction.replace(/\s+/g, " ").trim().slice(0, 220);
  return `métré quantités fournitures ratios DTU BTP France ${compact}`;
}

/**
 * Périmètre du métré :
 * - artisan : uniquement ce qui est demandé, et pour une demande globale uniquement son corps d'état ;
 * - client (widget public) : tous les corps d'état nécessaires à l'ouvrage décrit.
 */
export type TakeoffScope = { audience: "artisan"; tradeLabel: string | null } | { audience: "client" };

/** Préfixe des hypothèses listant les lots écartés (remonté tel quel en avertissement à l'artisan). */
export const OUT_OF_SCOPE_PREFIX = "Hors lot (autre corps d'état) :";

function scopeRules(scope: TakeoffScope): string {
  if (scope.audience === "client") {
    return `PÉRIMÈTRE — DEMANDE D'UN PARTICULIER :
Chiffre l'ouvrage complet demandé, tous corps d'état nécessaires confondus (ex. « maison neuve » : gros œuvre,
charpente-couverture, menuiseries, plâtrerie, plomberie, électricité…), sans ajouter de travaux non demandés.`;
  }
  const who = scope.tradeLabel ? `un artisan « ${scope.tradeLabel} »` : "un artisan (métier non renseigné)";
  return `PÉRIMÈTRE — NE JAMAIS EXTRAPOLER (devis établi par ${who}) :
- Chiffre UNIQUEMENT les ouvrages explicitement demandés. Pour une demande globale ou formulée simplement
  (« maison neuve de 125 m² », « rénovation complète », « extension »), ne retiens QUE les lots du métier de l'artisan.
  Ex. maçon + maison neuve → terrassement en rigole, fondations, soubassement, dallage / plancher bas, élévation des murs,
  chaînages, linteaux, appuis ; JAMAIS charpente, couverture, menuiseries, plâtrerie, isolation, plomberie,
  électricité, carrelage, peinture.
- Un lot d'un autre corps d'état n'est chiffré que s'il est NOMMÉ dans la demande (« avec la charpente »).
- Métier non renseigné : uniquement les ouvrages explicitement nommés, aucun lot déduit.
- Liste les lots écartés dans "assumptions", en une seule ligne commençant par « ${OUT_OF_SCOPE_PREFIX} ».
- La règle d'or ci-dessous (zéro oubli DTU) s'applique à l'intérieur de ce périmètre uniquement.`;
}

/**
 * Estime matériaux + MO à partir d'une description dimensionnée.
 * Enrichi par Tavily si `TAVILY_API_KEY` est configurée.
 * Sans `scope` : périmètre client (estimation publique, comportement historique).
 */
export async function runMaterialTakeoff(
  instruction: string,
  scope: TakeoffScope = { audience: "client" },
): Promise<(MaterialTakeoff & { webUsed: boolean; laborPhases?: RecipeLaborPhaseHours[] }) | null> {
  if (!needsMaterialTakeoff(instruction)) return null;

  const geometry = buildGeometryContext(instruction, scope);
  const shell = computeHouseStructuralShell(geometry);
  // Maçon + maison neuve sans autre lot nommé : gros œuvre 100 % déterministe,
  // ni recherche web ni appel au modèle (plus rapide, aucune quantité improvisée).
  if (shell && scope.audience === "artisan" && !geometry.extraLots) {
    return {
      work_summary: `Gros œuvre maison neuve ${geometry.house!.floorAreaM2} m² — murs en ${geometry.walls!.material}`,
      assumptions: [...geometryAssumptions(geometry), ...shell.assumptions],
      materials: shell.materials,
      masonry_wall_area_m2: geometry.walls!.netWallAreaM2,
      labor_hours_estimate: shell.laborHours,
      calculation_notes: "Gros œuvre calculé par ratios standards (fouilles, semelles, dallage, murs) — à valider sur chantier.",
      webUsed: false,
      laborPhases: shell.laborPhases,
    };
  }

  const web = await searchWebForQuoteContext(buildWebSearchQuery(instruction));
  const webBlock = web ? formatWebSearchForPrompt(web) : null;

  const systemPrompt = `Tu es métreur / économiste de la construction TCE en France (BTP, DTU, RE2020).
À partir de la description de travaux, établis le métré des FOURNITURES de l'ouvrage complet, prêt à être chiffré.

RÈGLE D'INTERPRÉTATION DU LANGAGE PROFANE ET CLIENT :
L'instruction peut émaner soit d'un artisan pressé, soit d'un particulier non professionnel via un formulaire web.
- Ne prends jamais au pied de la lettre une approximation ou une erreur de vocabulaire profane :
  * « Toit / toiture en ossature bois » → il s'agit TOUJOURS d'une charpente bois (fermette ou traditionnelle) supportant
    la couverture, JAMAIS de murs à ossature bois (MOB).
  * « Plâtre sur les murs / séparer une pièce » → cloisons de distribution ou doublage sur ossature métallique avec
    plaques de plâtre (type BA13).
  * « Refaire les tuyaux / la tuyauterie » → réseau hydrocâblé normalisé (PER ou multicouche, raccords, collecteurs, vannes).
  * « Refaire le sol » → décomposition selon le revêtement mentionné (primaire, colle ou sous-couche, revêtement,
    plinthes, barres de seuil).
- Traduis systématiquement l'intention brute selon les règles de l'art (DTU), en nomenclature marchande professionnelle,
  et note l'interprétation retenue dans "assumptions".

${scopeRules(scope)}

RÈGLE D'OR — zéro oubli DTU :
Tout ouvrage demandé est décomposé en son complexe technique complet (support, structure, étanchéité/protection,
finition, fixations, accessoires) — dans le périmètre ci-dessus. N'inclus QUE les lots demandés ou indissociables de
l'ouvrage décrit (« réfection de couverture » n'inclut pas la charpente ; « toiture neuve » l'inclut).

Matrice par corps d'état (désignations à reprendre telles quelles) :
- Charpente / Couverture : « ossature bois » est INTERDIT pour un toit (réservé aux murs MOB). Charpente =
  « Charpente fermette industrielle » (fourniture exprimée en m² de toiture) ou « Panne bois massif » / « Chevron bois
  massif » (ml). Complexe obligatoire : « Écran sous-toiture HPV » (+10 % recouvrement), « Contre-latte » (ml),
  « Liteau bois traité » (ml), « Tuile terre cuite mécanique » ou « Tuile béton » (u, +5 % casse), « Tuile faîtière » (ml de
  faîtage), « Closoir ventilé » (ml), « Tuile de rive » (ml de rive), « Crochet / pointe de fixation tuile », fixations
  charpente (« Équerre / connecteur de charpente », « Pointe annelée »). Pente, nombre de pans et longueurs de faîtage
  et de rives sont des hypothèses à écrire dans assumptions.
- Maçonnerie (parpaing / brique) : le matériau cité par la demande est impératif (brique demandée = jamais de parpaing).
  Les murs (blocs, mortier ou colle de montage, arase, chaînages, linteaux) sont calculés par le code à partir de
  "masonry_wall_area_m2" : ne les liste pas. Chaînages (DTU 20.1) : « Armature chaînage 4 filants HA » ou acier HA,
  JAMAIS de treillis soudé (réservé aux dallages et planchers).
- Isolation / Façade / Bardage : isolant (type, épaisseur, R), pare-pluie ou pare-vapeur, ossature secondaire
  (tasseaux ou rails), vêture / bardage, fixations, profils d'angle et de départ.
- Plâtrerie / Doublage / Cloison : jamais « placo » seul. « Plaque de plâtre BA13 » (hydro H1 en pièce humide, feu
  si exigé, +10 % chutes), « Rail R48 » / « Montant M48 » (ou 70/90 selon hauteur, entraxe 60 cm), « Vis TTPC 25 »
  (~15 u/m² de parement), « Bande à joint papier » (rouleaux), « Enduit à joint » (sacs ou seaux),
  « Bande résiliente » ; isolant acoustique si cloison séparative.
- Carrelage / Sols : jamais « carrelage » seul. « Primaire d'adhérence » (L), « Colle carrelage C2 » ou C2S
  (sacs de 25 kg, ~5 kg/m² en double encollage), carreaux en m² (+10 % chutes), « Croisillons autonivelants »,
  « Mortier de jointoiement » (sacs) ; ragréage si support à reprendre.
- Peinture : « Impression / sous-couche » (L), « Peinture de finition » 2 couches (L, ~10 m²/L par couche),
  « Enduit de lissage / rebouchage », consommables significatifs (« Ruban de masquage », « Bâche de protection »).
- Plomberie / Chauffage : tubes « PER » ou « Multicouche » (couronnes ou barres, diamètre), raccords à sertir ou à
  glissement, collecteurs, vannes d'arrêt, colliers de fixation, évacuations « Tube PVC » (diamètre) + raccords + colle PVC.
- Électricité (NF C 15-100) : « Gaine ICTA préfilée » (diamètre, section), « Tableau électrique » / divisionnaire,
  « Disjoncteur divisionnaire » par calibre, « Interrupteur différentiel 30 mA », appareillage (prises, interrupteurs),
  « Boîte d'encastrement étanche à l'air », câbles « R2V / RO2V » pour les liaisons hors gaine.
- Terrassement / VRD : « Géotextile », « Grave non traitée GNT 0/31.5 » ou tout-venant (t ou m³), « Sable de pose »,
  « Bordure béton », pavés ou enrobé.

Désignations et unités (elles servent à la recherche de prix en ligne et au catalogue fournisseur) :
- "name_generic" : désignation marchande standard, comme en négoce (« Écran sous-toiture HPV », « Montant M48 »,
  « Câble RO2V 3G2,5 »). Jamais de contexte flou (« bois pour toiture », « plâtre salon »), jamais de marque.
- "unit" : unité réelle d'achat : m², ml, sacs, rouleaux, boîtes, u, kg, L, m³, t.
- "quantity" : exprimée dans cette unité, chutes / recouvrements / casse inclus, arrondie à l'entier supérieur
  pour u, sacs, rouleaux et boîtes.
- "specifications" : conditionnement d'achat standard et caractéristique utile (« Rouleau de 75 m² », « Botte de 30 ml »,
  « Sac de 25 kg », « Boîte de 1000 », « Section 27×40 »). Si unit = sacs / rouleaux / boîtes, quantity compte ces
  conditionnements, pas les m² ou kg.

Murs maçonnés — parpaings ou briques (règle impérative) :
- Ils concernent les murs porteurs, pas le plancher, la dalle ni la toiture.
- Ne liste JAMAIS les blocs ni leur mortier, arase, chaînages ou linteaux dans "materials" et ne calcule JAMAIS leur
  quantité : indique uniquement la surface nette de murs à monter dans "masonry_wall_area_m2" (m², ouvertures
  déduites) — tout le complexe est calculé automatiquement. Sans mur maçonné, laisse ce champ null.
- N'invente aucune formule géométrique : si des DONNÉES GÉOMÉTRIQUES IMPOSÉES sont fournies, utilise-les telles quelles.
- "labor_hours_estimate" n'inclut PAS l'élévation de ces murs (ajoutée par le code).

Autres règles :
- Ne cumule pas plusieurs lots en multipliant plusieurs fois la même surface au sol.
- "assumptions" : TOUTES les déductions (pente, surfaces développées, entraxes, épaisseurs, formats, taux de chute,
  supports supposés sains, ouvertures non déduites…).
- "labor_hours_estimate" : total d'heures/homme réaliste d'un artisan qualifié pour l'ensemble des tâches décrites,
  calé sur les ratios ci-dessous (surface × ratio, borne basse pour un ouvrage simple et accessible, borne haute si
  complexité : pente forte, hauteur, accès difficile, nombreuses découpes). Écris le ratio retenu dans "assumptions".
  Ne cumule pas un ratio global et ses sous-tâches (ex. ratio toiture complète + bandes à joint = double compte).

RATIOS DE MAIN-D'ŒUVRE INDICATIFS (heures/homme) :
- Toiture / Couverture :
  * Neuf : charpente fermette industrielle + écran/liteaux + tuiles = 0,8 à 1,0 h/m² (ex. ~110-135 h pour 135 m²).
  * Neuf : charpente traditionnelle + couverture = 1,1 à 1,5 h/m².
  * Rénovation complète (dépose ancienne toiture + pose) = 1,4 à 1,9 h/m².
- Plâtrerie / Isolation :
  * Doublage / cloison standard (ossature + isolant + BA13) = 0,5 à 0,7 h/m².
  * Faux plafond sur suspentes = 0,6 à 0,8 h/m².
  * Bandes à joint (3 passes) = 0,15 à 0,25 h/m² de plaque.
- Revêtements de sol :
  * Carrelage sol standard (pose collée + joints) = 0,6 à 0,9 h/m².
  * Faïence murale = 0,8 à 1,2 h/m².
  * Parquet flottant / stratifié = 0,25 à 0,4 h/m².
- Peinture :
  * Préparation + impression + 2 couches finition murs/plafonds = 0,35 à 0,55 h/m² de surface développée.
- Plomberie / Chauffage / Électricité :
  * Rénovation complète salle de bain = 35 à 60 h selon complexité.
  * Réfection tableau électrique = 7 à 12 h.
  * Réseau hydrocâblé complet maison = 30 à 50 h.
- Ouvrage absent de la grille : raisonne par analogie avec la ligne la plus proche, sans dépasser l'ordre de grandeur.
- "calculation_notes" : rappel court que le métré est indicatif et doit être validé sur site.
- Si des références web sont fournies, croise-les avec ton expertise ; ne copie pas aveuglément.
- Pas d'outillage (seaux, truelles, disques) sauf quantités significatives.

MATRICE D'OUVRAGES (recettes calculées automatiquement par ratios) :
${formatRecipesForPrompt()}
- Si la demande porte sur UN SEUL ouvrage entièrement couvert par une recette : "matched_recipe_id" = son identifiant
  exact, "recipe_quantity" = quantité de base dans l'unité de la recette (mur : longueur × hauteur ; peinture : surface
  développée murs + plafonds ; électricité / plomberie : surface habitable), "materials" = [], "masonry_wall_area_m2" = null,
  et note dans "assumptions" comment la quantité a été obtenue. Les fournitures et heures sont alors calculées par le code.
- Plusieurs lots (ex. toiture + doublage), ouvrage partiellement couvert ou quantité impossible à établir :
  "matched_recipe_id" = null, "recipe_quantity" = null, et établis le métré complet comme décrit ci-dessus.`;

  const assumptionHint = takeoffAssumptionHint(instruction);
  const geometryBlock = geometryPromptBlock(geometry);

  const userParts = [`Description des travaux :\n${instruction}`];
  if (geometryBlock) userParts.push(geometryBlock);
  if (assumptionHint && !geometry.house) {
    userParts.push(assumptionHint);
  }
  if (webBlock) {
    userParts.push(`Références web (indicatives, à recouper) :\n${webBlock}`);
  } else {
    userParts.push(
      "Aucune recherche web disponible — base-toi sur les pratiques courantes du BTP en France.",
    );
  }

  const takeoff = await mistralChatParse(
    MaterialTakeoffSchema,
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userParts.join("\n\n") },
    ],
    "material_takeoff",
    {
      temperature: 0.15,
      jsonSchema: MATERIAL_TAKEOFF_JSON_SCHEMA,
      jsonExample: `{
  "work_summary": "Mur en parpaings 10 ml × 2 m sur semelle filante",
  "assumptions": ["Semelle filante 50 × 25 cm", "Pas d'ouverture déduite", "Pertes béton 5 %"],
  "materials": [
    { "name_generic": "Béton prêt à l'emploi C25/30", "quantity": 1.4, "unit": "m³", "specifications": "Semelle filante" },
    { "name_generic": "Armature semelle filante HA", "quantity": 10, "unit": "ml", "specifications": "Longueur 6 m" }
  ],
  "masonry_wall_area_m2": 20,
  "labor_hours_estimate": 16,
  "calculation_notes": "Métré indicatif — confirmer métrés et accès sur chantier.",
  "matched_recipe_id": null,
  "recipe_quantity": null
}`,
    },
  );

  if (!takeoff) return null;

  // Recette reconnue + quantité plausible : métré 100 % déterministe (Q × ratios),
  // les fournitures éventuellement proposées par le modèle sont ignorées.
  // Gros œuvre chaîné prioritaire : une recette isolée ne doit pas l'écraser.
  let recipe = shell ? null : findWorkRecipe(takeoff.matched_recipe_id);
  let recipeQuantity = takeoff.recipe_quantity ?? null;
  if (recipe && MASONRY_RECIPE_IDS.has(recipe.id)) {
    // Matériau demandé prioritaire (brique ≠ parpaing) ; surface de murs calculée si maison.
    recipe = findWorkRecipe(MASONRY_RECIPE_BY_MATERIAL[geometry.material ?? "parpaing"]) ?? recipe;
    if (geometry.walls) recipeQuantity = geometry.walls.netWallAreaM2;
  } else if (recipe?.id === "couverture_toiture_tuile_fermette" && geometry.roofAreaM2) {
    recipeQuantity = geometry.roofAreaM2;
  }
  if (recipe && recipeQuantity && recipeQuantity <= MAX_RECIPE_QUANTITY) {
    const { labor_phases, ...fromRecipe } = calculateTakeoffFromRecipe(recipe.id, recipeQuantity);
    return {
      ...fromRecipe,
      assumptions: [...fromRecipe.assumptions, ...geometryAssumptions(geometry), ...takeoff.assumptions],
      // Les fournitures viennent des ratios, pas du web : pas de mention « sources web ».
      webUsed: false,
      laborPhases: labor_phases,
    };
  }

  // Métré génératif : murs maçonnés toujours calculés par la recette du matériau
  // demandé, à partir de la surface calculée (maison) ou estimée par le modèle.
  const assumptions = [...geometryAssumptions(geometry), ...takeoff.assumptions];
  const meshCheck = dropMeshForTieBeams(takeoff.materials);
  let materials = meshCheck.materials;
  if (meshCheck.dropped) {
    assumptions.push("Treillis soudé retiré des chaînages : armatures HA 4 filants (DTU 20.1).");
  }

  if (shell) {
    // Gros œuvre déterministe + autres lots du modèle (doublons de gros œuvre retirés).
    const others = materials.filter((m) => {
      const n = foldName(m.name_generic);
      return !isMasonryUnitMaterial(m.name_generic) && !WALL_COMPLEX_RE.test(n) && !SHELL_COMPLEX_RE.test(n);
    });
    const otherHours = takeoff.labor_hours_estimate ?? 0;
    return {
      ...takeoff,
      materials: [...shell.materials, ...others],
      assumptions: [...assumptions, ...shell.assumptions],
      masonry_wall_area_m2: geometry.walls!.netWallAreaM2,
      labor_hours_estimate: Math.round((shell.laborHours + otherHours) * 10) / 10,
      webUsed: web !== null,
      laborPhases: [
        ...shell.laborPhases,
        ...(otherHours > 0 ? [{ title: `Autres lots : ${takeoff.work_summary || "travaux demandés"}`.slice(0, 160), hours: otherHours }] : []),
      ],
    };
  }

  const wallArea = geometry.walls?.netWallAreaM2 ?? takeoff.masonry_wall_area_m2 ?? null;
  let laborHours = takeoff.labor_hours_estimate;
  if (wallArea && wallArea <= MAX_RECIPE_QUANTITY) {
    const material = geometry.walls?.material ?? geometry.material ?? "parpaing";
    const walls = calculateTakeoffFromRecipe(MASONRY_RECIPE_BY_MATERIAL[material], wallArea);
    // Doublons proposés par le modèle malgré la consigne (blocs, mortier, arase, chaînages) : retirés.
    materials = [
      ...materials.filter((m) => !isMasonryUnitMaterial(m.name_generic) && !WALL_COMPLEX_RE.test(foldName(m.name_generic))),
      ...walls.materials,
    ];
    laborHours = Math.round(((laborHours ?? 0) + (walls.labor_hours_estimate ?? 0)) * 10) / 10 || null;
    assumptions.push(
      `Murs en ${material} calculés automatiquement : ${wallArea} m² nets × ratios de la recette (blocs, mortier, arase, chaînages HA, linteaux) ; élévation ${walls.labor_hours_estimate} h incluse.`,
    );
  }

  if (!materials.length) return null;
  return {
    ...takeoff,
    materials,
    assumptions,
    masonry_wall_area_m2: wallArea,
    labor_hours_estimate: laborHours,
    webUsed: web !== null,
  };
}

/** Hypothèses géométriques visibles par l'artisan (traçabilité du calcul). */
function geometryAssumptions(ctx: GeometryContext): string[] {
  if (!ctx.house) return [];
  const h = (ctx.walls?.heightM ?? facadeHeight(ctx.house)).toFixed(2).replace(".", ",");
  const out =
    ctx.house.levels === 2
      ? [
          `Configuration ${ctx.house.atticRooms ? "combles aménagés" : "R+1"} détectée : emprise au sol ${ctx.house.footprintM2} m², plancher intermédiaire ${ctx.house.footprintM2} m², élévation des murs ${ctx.house.atticRooms ? "RDC + jambettes" : "sur 2 niveaux"} (hauteur ${h} m).`,
        ]
      : [`Surface citée : ${ctx.house.floorAreaM2} m² (plain-pied).`];
  if (ctx.walls) {
    out.push(
      `Murs : périmètre 4 × √${ctx.house.footprintM2} × 1,08 = ${ctx.walls.perimeterLinearMeters} ml ; hauteur ${ctx.walls.heightM} m ; ${ctx.walls.grossWallAreaM2} m² bruts − ${ctx.walls.openingsAreaM2} m² d'ouvertures (18 %) = ${ctx.walls.netWallAreaM2} m² nets.`,
    );
  }
  if (ctx.roofAreaM2) {
    out.push(`Toiture : ${ctx.house.footprintM2} m² × 1,12 (débords) × pente 35 % = ${ctx.roofAreaM2} m² développés.`);
  }
  return out;
}

export function formatTakeoffForQuotePrompt(takeoff: MaterialTakeoff, webUsed: boolean): string {
  const lines = [
    "=== Métré automatique (indicatif — à valider sur chantier) ===",
    takeoff.work_summary,
    "",
    "Matériaux estimés :",
    ...takeoff.materials.map(
      (m) =>
        `- ${m.name_generic} : ${m.quantity} ${m.unit}${m.specifications ? ` (${m.specifications})` : ""}`,
    ),
  ];

  if (takeoff.labor_hours_estimate != null) {
    lines.push("", `Main-d'œuvre estimée : ~${takeoff.labor_hours_estimate} h`);
  }
  if (takeoff.assumptions.length) {
    lines.push("", "Hypothèses :", ...takeoff.assumptions.map((a) => `- ${a}`));
  }
  if (takeoff.calculation_notes) {
    lines.push("", takeoff.calculation_notes);
  }
  if (webUsed) {
    lines.push("", "(Quantités recoupées avec des sources web — vérification artisan recommandée.)");
  }

  return lines.join("\n");
}

export function takeoffWarnings(takeoff: MaterialTakeoff, webUsed: boolean): string[] {
  const warnings = [
    "Métré automatique — vérifie les quantités et hypothèses sur chantier avant envoi au client.",
  ];
  const outOfScope = takeoff.assumptions.find((a) => a.startsWith(OUT_OF_SCOPE_PREFIX));
  if (outOfScope) {
    warnings.push(`Non chiffré, hors de ton métier : ${outOfScope.slice(OUT_OF_SCOPE_PREFIX.length).trim()}`);
  }
  const others = takeoff.assumptions.filter((a) => a !== outOfScope);
  if (others.length) {
    warnings.push(`Hypothèses métré : ${others.slice(0, 3).join(" · ")}`);
  }
  if (webUsed) {
    warnings.push("Références web utilisées pour estimer les quantités.");
  }
  return warnings;
}
