"use server";

import { revalidatePath } from "next/cache";

import {
  VITRINE_GALLERY_MAX_IMAGES,
  VITRINE_MEDIA_BUCKET,
  vitrinePathBelongsToArtisan,
  type VitrineGalleryImage,
} from "@/lib/vitrine/gallery";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export type VitrineGalleryActionResult =
  | { ok: true }
  | { ok: false; error: string };

async function resolveArtisanProfileId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, slug")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile?.id) return null;
  return profile.id as string;
}

export async function listMyVitrineGalleryImages(): Promise<VitrineGalleryImage[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user.id).maybeSingle();
  if (!profile?.id) return [];

  const { data } = await supabase
    .from("artisan_vitrine_images")
    .select("id, storage_path, caption, sort_order, created_at")
    .eq("artisan_id", profile.id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  return (data ?? []) as VitrineGalleryImage[];
}

export async function registerVitrineGalleryImage(params: {
  storagePath: string;
  caption?: string | null;
}): Promise<VitrineGalleryActionResult> {
  const artisanId = await resolveArtisanProfileId();
  if (!artisanId) return { ok: false, error: "auth" };

  const storagePath = params.storagePath.trim();
  if (!vitrinePathBelongsToArtisan(storagePath, artisanId)) {
    return { ok: false, error: "invalid_path" };
  }

  const supabase = await createSupabaseServerClient();

  const { count } = await supabase
    .from("artisan_vitrine_images")
    .select("id", { count: "exact", head: true })
    .eq("artisan_id", artisanId);

  if ((count ?? 0) >= VITRINE_GALLERY_MAX_IMAGES) {
    return { ok: false, error: "limit" };
  }

  const { data: profile } = await supabase.from("profiles").select("slug").eq("id", artisanId).maybeSingle();
  const slug = profile?.slug as string | undefined;

  const { error } = await supabase.from("artisan_vitrine_images").insert({
    artisan_id: artisanId,
    storage_path: storagePath,
    caption: params.caption?.trim() || null,
    sort_order: count ?? 0,
  });

  if (error) {
    if (error.code === "23505") return { ok: true };
    return { ok: false, error: error.message };
  }

  if (slug) revalidatePath(`/site/${slug}`);
  revalidatePath("/app/reglages");
  return { ok: true };
}

export async function deleteVitrineGalleryImage(imageId: string): Promise<VitrineGalleryActionResult> {
  const artisanId = await resolveArtisanProfileId();
  if (!artisanId) return { ok: false, error: "auth" };

  const supabase = await createSupabaseServerClient();

  const { data: row } = await supabase
    .from("artisan_vitrine_images")
    .select("id, storage_path")
    .eq("id", imageId)
    .eq("artisan_id", artisanId)
    .maybeSingle();

  if (!row?.storage_path) return { ok: false, error: "not_found" };

  const { error: delRow } = await supabase.from("artisan_vitrine_images").delete().eq("id", imageId);
  if (delRow) return { ok: false, error: delRow.message };

  const admin = createSupabaseServiceRoleClient();
  if (admin) {
    await admin.storage.from(VITRINE_MEDIA_BUCKET).remove([row.storage_path as string]);
  } else {
    await supabase.storage.from(VITRINE_MEDIA_BUCKET).remove([row.storage_path as string]);
  }

  const { data: profile } = await supabase.from("profiles").select("slug").eq("id", artisanId).maybeSingle();
  const slug = profile?.slug as string | undefined;
  if (slug) revalidatePath(`/site/${slug}`);
  revalidatePath("/app/reglages");
  return { ok: true };
}
