"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAdminDb } from "@/lib/admin/db";
import { writeAdminAuditLog } from "@/lib/admin/audit-log";
import { requirePlatformAdminSafe } from "@/lib/auth/platform-admin";
import {
  cancelReferrerInvitation,
  createReferrerInvitation,
  resendReferrerInvitation,
} from "@/lib/referrers/invitations";
import { parseReferrerInvitationInput, type FieldErrors } from "@/lib/referrers/validation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function guardAdmin() {
  const res = await requirePlatformAdminSafe();
  if (!res.ok) {
    if (res.error === "auth") redirect("/login?next=/admin/apporteurs");
    redirect("/admin/forbidden");
  }
  const admin = getAdminDb();
  if (!admin) throw new Error("ADMIN_MISSING_SERVICE_ROLE");
  return { user: res.user, admin };
}

export type InviteResult =
  | { ok: true; url: string; sent: boolean }
  | { ok: false; error: string; fieldErrors?: FieldErrors };

const CREATE_ERRORS: Record<string, string> = {
  already_referrer: "Cette adresse a déjà un accès apporteur.",
  already_invited: "Une invitation est déjà en cours pour cette adresse : utiliser « Renvoyer ».",
  email_has_account: "Cette adresse a déjà un compte Soline (artisan ou client) : en choisir une autre.",
  db: "Enregistrement impossible, réessayer.",
};

export async function inviteReferrerAction(input: Record<string, string>): Promise<InviteResult> {
  const { user, admin } = await guardAdmin();
  const parsed = parseReferrerInvitationInput(input);
  if (!parsed.ok) return { ok: false, error: "Vérifie les champs.", fieldErrors: parsed.errors };

  const res = await createReferrerInvitation(admin, { ...parsed.value, adminUserId: user.id });
  if (!res.ok) return { ok: false, error: CREATE_ERRORS[res.error] ?? CREATE_ERRORS.db! };

  await writeAdminAuditLog({
    adminUserId: user.id,
    action: "referrer.invite",
    details: { invitation_id: res.invitationId, email: parsed.value.email, siren: parsed.value.siren, email_sent: res.sent },
  });
  revalidatePath("/admin/apporteurs");
  return { ok: true, url: res.url, sent: res.sent };
}

export async function resendReferrerInvitationAction(invitationId: string): Promise<InviteResult> {
  const { user, admin } = await guardAdmin();
  if (!UUID.test(invitationId)) return { ok: false, error: "Invitation introuvable." };
  const res = await resendReferrerInvitation(admin, invitationId);
  if (!res.ok) {
    return { ok: false, error: res.error === "closed" ? "Invitation déjà utilisée ou annulée." : "Renvoi impossible." };
  }
  await writeAdminAuditLog({
    adminUserId: user.id,
    action: "referrer.invite_resend",
    details: { invitation_id: invitationId, email_sent: res.sent },
  });
  revalidatePath("/admin/apporteurs");
  return { ok: true, url: res.url, sent: res.sent };
}

export async function cancelReferrerInvitationAction(invitationId: string): Promise<{ ok: boolean; error?: string }> {
  const { user, admin } = await guardAdmin();
  if (!UUID.test(invitationId)) return { ok: false, error: "Invitation introuvable." };
  const done = await cancelReferrerInvitation(admin, invitationId);
  if (!done) return { ok: false, error: "Invitation déjà utilisée ou annulée." };
  await writeAdminAuditLog({ adminUserId: user.id, action: "referrer.invite_cancel", details: { invitation_id: invitationId } });
  revalidatePath("/admin/apporteurs");
  return { ok: true };
}

export async function setReferrerStatusAction(
  referrerId: string,
  status: "active" | "suspended",
): Promise<{ ok: boolean; error?: string }> {
  const { user, admin } = await guardAdmin();
  if (!UUID.test(referrerId) || (status !== "active" && status !== "suspended")) return { ok: false, error: "Requête invalide." };
  const { data, error } = await admin
    .from("business_referrers")
    .update({ status })
    .eq("id", referrerId)
    .select("id, user_id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "Mise à jour impossible." };
  await writeAdminAuditLog({
    adminUserId: user.id,
    action: status === "suspended" ? "referrer.suspend" : "referrer.reactivate",
    targetUserId: data.user_id as string,
    details: { referrer_id: referrerId },
  });
  revalidatePath("/admin/apporteurs");
  return { ok: true };
}
