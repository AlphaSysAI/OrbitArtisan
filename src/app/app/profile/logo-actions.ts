"use server";

import { revalidatePath } from "next/cache";

import { requireArtisanProfileId } from "@/lib/auth/require-artisan";
import { detectLogoKind, LOGO_MAX_BYTES, logoStoragePath, ownLogoStoragePath } from "@/lib/branding/logo";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { VITRINE_MEDIA_BUCKET, vitrineMediaPublicUrl } from "@/lib/vitrine/gallery";

type LogoActionResult =
  | { ok: true; logoUrl: string | null }
  | { ok: false; error: "auth" | "missing_file" | "too_large" | "invalid_type" | "upload_failed" | "update_failed" };

async function removeOldLogo(previousUrl: string | null, profileId: string) {
  const path = ownLogoStoragePath(previousUrl, profileId);
  if (!path) return;
  const admin = createSupabaseServiceRoleClient();
  if (admin) await admin.storage.from(VITRINE_MEDIA_BUCKET).remove([path]);
}

async function revalidateBranding(slug: string | null | undefined) {
  revalidatePath("/app/reglages");
  if (slug) revalidatePath(`/site/${slug}`);
}

/** Enregistre le logo (PNG/JPEG déjà redimensionné côté navigateur) et remplace l'ancien. */
export async function uploadArtisanLogo(formData: FormData): Promise<LogoActionResult> {
  const auth = await requireArtisanProfileId();
  if (!auth.ok) return { ok: false, error: "auth" };
  const { supabase, profileId } = auth;

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "missing_file" };
  if (file.size > LOGO_MAX_BYTES) return { ok: false, error: "too_large" };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = detectLogoKind(bytes);
  if (!kind) return { ok: false, error: "invalid_type" };

  const path = logoStoragePath(profileId, kind);
  const { error: uploadError } = await supabase.storage.from(VITRINE_MEDIA_BUCKET).upload(path, bytes, {
    contentType: kind === "png" ? "image/png" : "image/jpeg",
    cacheControl: "31536000",
    upsert: false,
  });
  if (uploadError) return { ok: false, error: "upload_failed" };

  const logoUrl = vitrineMediaPublicUrl(path);
  const { data: previous } = await supabase.from("profiles").select("logo_url, slug").eq("id", profileId).maybeSingle();

  const { error: updateError } = await supabase.from("profiles").update({ logo_url: logoUrl }).eq("id", profileId);
  if (updateError) {
    const admin = createSupabaseServiceRoleClient();
    if (admin) await admin.storage.from(VITRINE_MEDIA_BUCKET).remove([path]);
    return { ok: false, error: "update_failed" };
  }

  await removeOldLogo((previous?.logo_url as string | null) ?? null, profileId);
  await revalidateBranding(previous?.slug as string | undefined);
  return { ok: true, logoUrl };
}

export async function removeArtisanLogo(): Promise<LogoActionResult> {
  const auth = await requireArtisanProfileId();
  if (!auth.ok) return { ok: false, error: "auth" };
  const { supabase, profileId } = auth;

  const { data: previous } = await supabase.from("profiles").select("logo_url, slug").eq("id", profileId).maybeSingle();
  const { error } = await supabase.from("profiles").update({ logo_url: null }).eq("id", profileId);
  if (error) return { ok: false, error: "update_failed" };

  await removeOldLogo((previous?.logo_url as string | null) ?? null, profileId);
  await revalidateBranding(previous?.slug as string | undefined);
  return { ok: true, logoUrl: null };
}
