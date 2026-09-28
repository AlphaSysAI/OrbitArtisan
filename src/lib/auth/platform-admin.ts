import "server-only";

import { getCurrentUser, getIsPlatformAdmin } from "@/lib/auth/session";

/** Vérifie si l'utilisateur connecté est Super Admin plateforme (mémoïsé par requête). */
export async function isPlatformAdmin(userId: string): Promise<boolean> {
  return getIsPlatformAdmin(userId);
}

/** Retourne l'utilisateur courant s'il est Super Admin, sinon null. */
export async function getPlatformAdminUser() {
  const user = await getCurrentUser();
  if (!user) return null;
  const ok = await getIsPlatformAdmin(user.id);
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
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "auth" };
  const ok = await getIsPlatformAdmin(user.id);
  if (!ok) return { ok: false, error: "forbidden" };
  return { ok: true, user: { id: user.id, email: user.email } };
}
