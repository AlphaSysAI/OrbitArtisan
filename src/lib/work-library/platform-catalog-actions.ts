"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  filterPlatformCatalog,
  getPlatformCatalogItem,
  platformCatalogMeta,
  searchPlatformCatalog,
} from "@/lib/work-library/platform-catalog";
import type { PlatformWorkItem } from "@/lib/work-library/platform-catalog-types";
import { isWorkUnit } from "@/lib/work-library/units";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

export async function copyPlatformItemToLibrary(platformItemId: string) {
  const ctx = await requireArtisanProfile();
  if (!ctx.ok) return ctx;

  const platformItem = getPlatformCatalogItem(platformItemId);
  if (!platformItem) return { ok: false as const, error: "not_found" as const };

  const visible = filterPlatformCatalog(ctx.tradeCategoryId, ctx.tradeId);
  if (!visible.some((i) => i.id === platformItemId)) {
    return { ok: false as const, error: "forbidden_trade" as const };
  }

  const { supabase, userId } = ctx;

  if (platformItem.reference) {
    const { data: existing } = await supabase
      .from("work_items")
      .select("id")
      .eq("user_id", userId)
      .eq("reference", platformItem.reference)
      .maybeSingle();
    if (existing?.id) {
      return {
        ok: false as const,
        error: "already_imported" as const,
        existingId: existing.id,
        item: platformItem,
      };
    }
  }

  let categoryId: string | null = null;
  const catName = platformItem.workCategory.trim();
  if (catName) {
    const { data: cats } = await supabase
      .from("work_categories")
      .select("id, name")
      .eq("user_id", userId);
    const match = (cats ?? []).find((c) => c.name.toLowerCase() === catName.toLowerCase());
    if (match?.id) {
      categoryId = match.id;
    } else {
      const { data: created } = await supabase
        .from("work_categories")
        .insert({ user_id: userId, name: catName })
        .select("id")
        .single();
      categoryId = created?.id ?? null;
    }
  }

  const unit = isWorkUnit(platformItem.unit) ? platformItem.unit : "U";

  const { data: inserted, error } = await supabase
    .from("work_items")
    .insert({
      user_id: userId,
      category_id: categoryId,
      reference: platformItem.reference,
      title: platformItem.title,
      description: platformItem.description,
      unit,
      unit_price_ht: platformItem.unitPriceHt,
      default_vat_rate: platformItem.defaultVatRate,
      labor_cost: platformItem.laborCost,
      material_cost: platformItem.materialCost,
      estimated_hours: platformItem.estimatedHours,
    })
    .select("id")
    .single();

  if (error || !inserted?.id) {
    return { ok: false as const, error: "insert_failed" as const };
  }

  revalidatePath("/app/ouvrages");
  revalidatePath("/app/quotes/new");
  return { ok: true as const, workItemId: inserted.id, item: platformItem };
}

export async function copyAllPlatformCatalogToLibrary() {
  const list = await listPlatformCatalogForProfile();
  if (!list.ok) return { ok: false as const, error: list.error, imported: 0, skipped: 0 };

  let imported = 0;
  let skipped = 0;
  for (const item of list.items) {
    const res = await copyPlatformItemToLibrary(item.id);
    if (res.ok) imported++;
    else skipped++;
  }

  revalidatePath("/app/ouvrages");
  return { ok: true as const, imported, skipped };
}
