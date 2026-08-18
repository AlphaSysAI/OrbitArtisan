import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Vérifie si l'utilisateur connecté est Super Admin plateforme. */
export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return !!data?.user_id;
}

/** Retourne l'utilisateur courant s'il est Super Admin, sinon null. */
export async function getPlatformAdminUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const ok = await isPlatformAdmin(user.id);
  return ok ? user : null;
}

/** Guard serveur — lève une erreur si pas Super Admin. */
export async function requirePlatformAdmin() {
  const user = await getPlatformAdminUser();
  if (!user) {
    throw new Error("FORBIDDEN_SUPER_ADMIN");
  }
  return user;
}

export type RequirePlatformAdminResult =
  | { ok: true; user: { id: string; email?: string } }
  | { ok: false; error: "auth" | "forbidden" };

export async function requirePlatformAdminSafe(): Promise<RequirePlatformAdminResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "auth" };
  const ok = await isPlatformAdmin(user.id);
  if (!ok) return { ok: false, error: "forbidden" };
  return { ok: true, user: { id: user.id, email: user.email } };
}
