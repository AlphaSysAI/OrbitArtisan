"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  filterPlatformCatalog,
  getPlatformCatalogItem,
  listPlatformCatalogByCategory,
  platformCatalogMeta,
  searchPlatformCatalog,
} from "@/lib/work-library/platform-catalog";
import type { PlatformWorkItem } from "@/lib/work-library/platform-catalog-types";
import { isWorkUnit } from "@/lib/work-library/units";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findTradeCategory } from "@/lib/trades/taxonomy";

async function requireArtisanProfile() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, trade_category, trade")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile?.id) {
    return { ok: false as const, error: "no_profile" as const };
  }

  return {
    ok: true as const,
    supabase,
    userId: user.id,
    tradeCategoryId: profile.trade_category as string | null,
    tradeId: profile.trade as string | null,
  };
}

export async function listPlatformCatalogForProfile(): Promise<
  | { ok: true; items: PlatformWorkItem[]; tradeLabel: string | null; count: number }
  | { ok: false; error: "no_profile" | "trade_not_set" }
> {
  const ctx = await requireArtisanProfile();
  if (!ctx.ok) return ctx;

  const { tradeCategoryId, tradeId } = ctx;
  if (!tradeCategoryId || !tradeId) {
    return { ok: false, error: "trade_not_set" };
  }

  const items = filterPlatformCatalog(tradeCategoryId, tradeId);
  const { tradeLabel, count } = platformCatalogMeta(tradeCategoryId, tradeId);
  return { ok: true, items, tradeLabel, count };
}

export async function searchPlatformCatalogForProfile(query: string, limit = 24) {
  const ctx = await requireArtisanProfile();
  if (!ctx.ok) return { ok: false as const, error: ctx.error, items: [] as PlatformWorkItem[] };

  const items = searchPlatformCatalog(ctx.tradeCategoryId, ctx.tradeId, query, limit);
  return { ok: true as const, items };
}

/**
 * Parcours libre du catalogue (artisans polyvalents) : une famille de métiers entière.
 * Données publiques en dur — aucun enjeu multi-tenant ; le profil sert seulement à l'auth.
 */
export async function browsePlatformCatalog(tradeCategoryId: string) {
  const ctx = await requireArtisanProfile();
  if (!ctx.ok) return { ok: false as const, error: ctx.error, items: [] as PlatformWorkItem[] };
  if (!findTradeCategory(tradeCategoryId)) return { ok: false as const, error: "unknown_category" as const, items: [] };
  return { ok: true as const, items: listPlatformCatalogByCategory(tradeCategoryId) };
}

type ArtisanCtx = Extract<Awaited<ReturnType<typeof requireArtisanProfile>>, { ok: true }>;

/** Copie en lot vers la bibliothèque : doublons de référence ignorés, catégories créées au besoin. */
async function insertPlatformItems(ctx: ArtisanCtx, items: PlatformWorkItem[]) {
  const { supabase, userId } = ctx;
  const [{ data: existing }, { data: cats }] = await Promise.all([
    supabase.from("work_items").select("reference").eq("user_id", userId).not("reference", "is", null),
    supabase.from("work_categories").select("id, name").eq("user_id", userId),
  ]);
  const refs = new Set((existing ?? []).map((e) => String(e.reference).toLowerCase()));
  const fresh = items.filter((item) => {
    const ref = item.reference.toLowerCase();
    if (refs.has(ref)) return false;
    refs.add(ref);
    return true;
  });
  if (fresh.length === 0) return { inserted: 0, skipped: items.length, ids: [] as string[], error: null as string | null };

  const categoryByName = new Map((cats ?? []).map((c) => [String(c.name).toLowerCase(), c.id as string]));
  const missing = [...new Set(fresh.map((i) => i.workCategory.trim()).filter(Boolean))].filter(
    (name) => !categoryByName.has(name.toLowerCase()),
  );
  if (missing.length > 0) {
    const { data: created } = await supabase
      .from("work_categories")
      .insert(missing.map((name) => ({ user_id: userId, name })))
      .select("id, name");
    for (const c of created ?? []) categoryByName.set(String(c.name).toLowerCase(), c.id as string);
  }

  const { data: insertedRows, error } = await supabase.from("work_items").insert(
    fresh.map((item) => ({
      user_id: userId,
      category_id: categoryByName.get(item.workCategory.trim().toLowerCase()) ?? null,
      reference: item.reference,
      title: item.title,
      description: item.description,
      unit: isWorkUnit(item.unit) ? item.unit : "U",
      unit_price_ht: item.unitPriceHt,
      default_vat_rate: item.defaultVatRate,
      labor_cost: item.laborCost,
      material_cost: item.materialCost,
      estimated_hours: item.estimatedHours,
    })),
  ).select("id");
  if (error) return { inserted: 0, skipped: items.length - fresh.length, ids: [], error: error.message };

  revalidatePath("/app/ouvrages");
  revalidatePath("/app/quotes/new");
  return {
    inserted: fresh.length,
    skipped: items.length - fresh.length,
    ids: (insertedRows ?? []).map((r) => r.id as string),
    error: null,
  };
}

export async function copyPlatformItemToLibrary(platformItemId: string) {
  const ctx = await requireArtisanProfile();
  if (!ctx.ok) return ctx;

  const platformItem = getPlatformCatalogItem(platformItemId);
  if (!platformItem) return { ok: false as const, error: "not_found" as const };

  const res = await insertPlatformItems(ctx, [platformItem]);
  if (res.error) return { ok: false as const, error: "insert_failed" as const };
  if (res.inserted === 0) {
    const { data: existing } = await ctx.supabase
      .from("work_items")
      .select("id")
      .eq("user_id", ctx.userId)
      .eq("reference", platformItem.reference)
      .limit(1)
      .maybeSingle();
    return {
      ok: false as const,
      error: "already_imported" as const,
      existingId: (existing?.id as string | undefined) ?? null,
      item: platformItem,
    };
  }
  return { ok: true as const, workItemId: res.ids[0]!, item: platformItem };
}

const MAX_BULK_COPY = 300;

/** « Tout importer » : uniquement les ouvrages affichés (ids envoyés par le client, revalidés ici). */
export async function copyPlatformItemsToLibrary(platformItemIds: string[]) {
  const ctx = await requireArtisanProfile();
  if (!ctx.ok) return { ok: false as const, error: ctx.error, imported: 0, skipped: 0 };

  const items = [...new Set(platformItemIds)]
    .slice(0, MAX_BULK_COPY)
    .map((id) => getPlatformCatalogItem(id))
    .filter((i): i is PlatformWorkItem => i != null);
  if (items.length === 0) return { ok: false as const, error: "empty" as const, imported: 0, skipped: 0 };

  const res = await insertPlatformItems(ctx, items);
  if (res.error) return { ok: false as const, error: "insert_failed" as const, imported: 0, skipped: res.skipped };
  return { ok: true as const, imported: res.inserted, skipped: res.skipped };
}
