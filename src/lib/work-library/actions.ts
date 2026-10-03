"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  decodeTextBytes,
  mapWorkItemMatrix,
  MAX_IMPORT_ROWS,
  parseDelimitedText,
  serializeWorkItemsCsv,
  type WorkItemsImportResult,
} from "@/lib/work-library/csv";
import { readXlsxMatrix } from "@/lib/files/read-xlsx";
import type { WorkItemInput, WorkItemWithCategory } from "@/lib/work-library/types";
import { isVatRate, isWorkUnit, VAT_RATES } from "@/lib/work-library/units";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ilikeOrPattern } from "@/lib/security/postgrest-filter";

async function requireUserId() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, userId: user.id };
}

function mapWorkItem(row: Record<string, unknown>, categoryName?: string | null): WorkItemWithCategory {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    category_id: (row.category_id as string | null) ?? null,
    reference: (row.reference as string | null) ?? null,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    unit: row.unit as string,
    unit_price_ht: Number(row.unit_price_ht ?? 0),
    default_vat_rate: Number(row.default_vat_rate ?? 20),
    labor_cost: Number(row.labor_cost ?? 0),
    material_cost: Number(row.material_cost ?? 0),
    estimated_hours: Number(row.estimated_hours ?? 0),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    category_name: categoryName ?? null,
  };
}

export async function seedDefaultWorkLibraryForUser(userId: string) {
  const supabase = await createSupabaseServerClient();
  await supabase.rpc("seed_default_work_library", { p_user_id: userId });
}

export async function listWorkCategories() {
  const { supabase, userId } = await requireUserId();
  const { data, error } = await supabase
    .from("work_categories")
    .select("id, user_id, name, created_at")
    .eq("user_id", userId)
    .order("name");

  if (error) return { ok: false as const, error: "fetch_failed" as const, items: [] };
  return { ok: true as const, items: data ?? [] };
}

export async function listWorkItems(params?: { q?: string; categoryId?: string | null }) {
  const { supabase, userId } = await requireUserId();

  let query = supabase
    .from("work_items")
    .select("*, work_categories(name)")
    .eq("user_id", userId)
    .order("title");

  if (params?.categoryId) {
    query = query.eq("category_id", params.categoryId);
  }

  const { data, error } = await query;
  if (error) return { ok: false as const, error: "fetch_failed" as const, items: [] as WorkItemWithCategory[] };

  let items = (data ?? []).map((row) => {
    const cat = row.work_categories as { name?: string } | null;
    const { work_categories: _wc, ...rest } = row;
    return mapWorkItem(rest, cat?.name ?? null);
  });

  const q = params?.q?.trim().toLowerCase();
  if (q) {
    items = items.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        (item.reference?.toLowerCase().includes(q) ?? false) ||
        (item.description?.toLowerCase().includes(q) ?? false),
    );
  }

  return { ok: true as const, items };
}

export async function searchWorkItems(query: string, limit = 12) {
  const { supabase, userId } = await requireUserId();
  const q = query.trim();
  if (!q) return { ok: true as const, items: [] as WorkItemWithCategory[] };

  const pattern = ilikeOrPattern(q);
  const { data, error } = await supabase
    .from("work_items")
    .select("*, work_categories(name)")
    .eq("user_id", userId)
    .or(`title.ilike.${pattern},reference.ilike.${pattern},description.ilike.${pattern}`)
    .order("title")
    .limit(limit);

  if (error) return { ok: false as const, error: "fetch_failed" as const, items: [] as WorkItemWithCategory[] };

  const items = (data ?? []).map((row) => {
    const cat = row.work_categories as { name?: string } | null;
    const { work_categories: _wc, ...rest } = row;
    return mapWorkItem(rest, cat?.name ?? null);
  });

  return { ok: true as const, items };
}

function validateWorkItemInput(input: WorkItemInput): string | null {
  if (!input.title.trim()) return "missing_title";
  if (!isWorkUnit(input.unit)) return "invalid_unit";
  if (!isVatRate(input.default_vat_rate) && !VAT_RATES.includes(input.default_vat_rate as (typeof VAT_RATES)[number])) {
    return "invalid_vat";
  }
  if (input.unit_price_ht < 0 || input.labor_cost < 0 || input.material_cost < 0 || input.estimated_hours < 0) {
    return "invalid_amounts";
  }
  return null;
}

export async function upsertWorkItem(input: WorkItemInput) {
  const validationError = validateWorkItemInput(input);
  if (validationError) return { ok: false as const, error: validationError as "missing_title" };

  const { supabase, userId } = await requireUserId();

  const payload = {
    user_id: userId,
    category_id: input.category_id || null,
    reference: input.reference?.trim() || null,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    unit: input.unit,
    unit_price_ht: input.unit_price_ht,
    default_vat_rate: input.default_vat_rate,
    labor_cost: input.labor_cost,
    material_cost: input.material_cost,
    estimated_hours: input.estimated_hours,
  };

  if (input.id) {
    const { error } = await supabase.from("work_items").update(payload).eq("id", input.id).eq("user_id", userId);
    if (error) return { ok: false as const, error: "update_failed" as const };
  } else {
    const { error } = await supabase.from("work_items").insert(payload);
    if (error) return { ok: false as const, error: "insert_failed" as const };
  }

  revalidatePath("/app/ouvrages");
  revalidatePath("/app/quotes/new");
  return { ok: true as const };
}

export async function deleteWorkItem(id: string) {
  const { supabase, userId } = await requireUserId();
  const { error } = await supabase.from("work_items").delete().eq("id", id).eq("user_id", userId);
  if (error) return { ok: false as const, error: "delete_failed" as const };
  revalidatePath("/app/ouvrages");
  return { ok: true as const };
}

const MAX_IMPORT_FILE_BYTES = 4 * 1024 * 1024;

type ImportFileError = "no_file" | "too_large" | "xls_unsupported" | "unreadable" | "empty";

/** Fichier CSV ou XLSX → lignes d'ouvrages (même analyse pour l'aperçu et l'import). */
async function readWorkItemsFile(
  formData: FormData,
): Promise<{ ok: true; result: WorkItemsImportResult } | { ok: false; error: ImportFileError }> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "no_file" };
  if (file.size > MAX_IMPORT_FILE_BYTES) return { ok: false, error: "too_large" };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const isOle = bytes[0] === 0xd0 && bytes[1] === 0xcf;
  if (isOle || name.endsWith(".xls")) return { ok: false, error: "xls_unsupported" };

  let matrix: string[][];
  try {
    matrix = isZip ? readXlsxMatrix(Buffer.from(bytes), MAX_IMPORT_ROWS + 20) : parseDelimitedText(decodeTextBytes(bytes));
  } catch {
    return { ok: false, error: "unreadable" };
  }
  const result = mapWorkItemMatrix(matrix.filter((r) => r.some((c) => c.trim() !== "")));
  if (result.rows.length === 0) return { ok: false, error: "empty" };
  return { ok: true, result };
}

/** Aperçu avant import : colonnes reconnues, 5 premières lignes, alertes. Aucune écriture. */
export async function analyzeWorkItemsFile(formData: FormData) {
  await requireUserId();
  const read = await readWorkItemsFile(formData);
  if (!read.ok) return read;
  const { rows, errors, detectedColumns, headerFound, truncated } = read.result;
  return {
    ok: true as const,
    total: rows.length,
    preview: rows.slice(0, 5),
    errors: errors.slice(0, 20),
    errorCount: errors.length,
    detectedColumns,
    headerFound,
    truncated,
  };
}

const dedupeKey = (title: string, unit: string) => `${title.trim().toLowerCase()}|${unit}`;

/**
 * Import confirmé : le fichier est ré-analysé côté serveur (rien n'est repris du client).
 * Doublons ignorés : même référence, ou même désignation + unité, déjà en bibliothèque ou dans le fichier.
 */
export async function importWorkItemsFile(formData: FormData) {
  const { supabase, userId } = await requireUserId();
  const read = await readWorkItemsFile(formData);
  if (!read.ok) return { ok: false as const, error: read.error, imported: 0, skipped: 0 };
  const { rows } = read.result;

  const [{ data: categories }, { data: existing }] = await Promise.all([
    supabase.from("work_categories").select("id, name").eq("user_id", userId),
    supabase.from("work_items").select("reference, title, unit").eq("user_id", userId),
  ]);

  const seenRefs = new Set((existing ?? []).map((e) => (e.reference as string | null)?.trim().toLowerCase()).filter(Boolean));
  const seenTitles = new Set((existing ?? []).map((e) => dedupeKey(e.title as string, e.unit as string)));
  const fresh = rows.filter((row) => {
    const ref = row.reference.trim().toLowerCase();
    const key = dedupeKey(row.title, row.unit);
    if ((ref && seenRefs.has(ref)) || seenTitles.has(key)) return false;
    if (ref) seenRefs.add(ref);
    seenTitles.add(key);
    return true;
  });

  const categoryByName = new Map((categories ?? []).map((c) => [String(c.name).toLowerCase(), c.id as string]));
  const missing = [
    ...new Map(
      fresh
        .map((r) => r.category.trim())
        .filter((name) => name && !categoryByName.has(name.toLowerCase()))
        .map((name) => [name.toLowerCase(), name]),
    ).values(),
  ];
  if (missing.length > 0) {
    const { data: created } = await supabase
      .from("work_categories")
      .insert(missing.map((name) => ({ user_id: userId, name })))
      .select("id, name");
    for (const c of created ?? []) categoryByName.set(String(c.name).toLowerCase(), c.id as string);
  }

  let imported = 0;
  for (let i = 0; i < fresh.length; i += 500) {
    const chunk = fresh.slice(i, i + 500).map((row) => ({
      user_id: userId,
      category_id: categoryByName.get(row.category.trim().toLowerCase()) ?? null,
      reference: row.reference || null,
      title: row.title,
      description: row.description || null,
      unit: row.unit,
      unit_price_ht: row.unit_price_ht,
      default_vat_rate: row.default_vat_rate,
      labor_cost: row.labor_cost,
      material_cost: row.material_cost,
      estimated_hours: row.estimated_hours,
    }));
    const { error } = await supabase.from("work_items").insert(chunk);
    if (error) {
      console.error("[work-library import]", error.message);
      break;
    }
    imported += chunk.length;
  }

  revalidatePath("/app/ouvrages");
  const skipped = rows.length - fresh.length;
  if (imported === 0 && fresh.length > 0) return { ok: false as const, error: "insert_failed" as const, imported, skipped };
  return { ok: true as const, imported, skipped };
}

export async function exportWorkItemsCsv() {
  const result = await listWorkItems();
  if (!result.ok) return { ok: false as const, error: "fetch_failed" as const };

  const csv = serializeWorkItemsCsv(
    result.items.map((item) => ({
      reference: item.reference,
      title: item.title,
      description: item.description,
      category_name: item.category_name,
      unit: item.unit,
      unit_price_ht: item.unit_price_ht,
      default_vat_rate: item.default_vat_rate,
      labor_cost: item.labor_cost,
      material_cost: item.material_cost,
      estimated_hours: item.estimated_hours,
    })),
  );

  return { ok: true as const, csv };
}

export async function saveQuoteLineToLibrary(input: {
  title: string;
  description?: string;
  unit: string;
  unit_price_ht: number;
  default_vat_rate: number;
  labor_cost?: number;
  material_cost?: number;
  estimated_hours?: number;
  category_id?: string | null;
}) {
  return upsertWorkItem({
    title: input.title,
    description: input.description ?? null,
    unit: isWorkUnit(input.unit) ? input.unit : "U",
    unit_price_ht: input.unit_price_ht,
    default_vat_rate: isVatRate(input.default_vat_rate) ? input.default_vat_rate : 20,
    labor_cost: input.labor_cost ?? 0,
    material_cost: input.material_cost ?? 0,
    estimated_hours: input.estimated_hours ?? 0,
    category_id: input.category_id ?? null,
  });
}
