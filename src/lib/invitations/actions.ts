"use server";

import { revalidatePath } from "next/cache";

import { getPublicSiteUrl } from "@/lib/site-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export type PlatformAccountType = "client" | "artisan";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type InvitationPreview = {
  token: string;
  email: string;
  invitedName: string | null;
  accountType: PlatformAccountType;
  inviterLabel: string;
  artisanName: string | null;
  artisanSlug: string | null;
  expired: boolean;
};

export async function createPlatformInvitation(formData: FormData) {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const invitedName = String(formData.get("invited_name") ?? "").trim() || null;
  const accountType = String(formData.get("account_type") ?? "client") as PlatformAccountType;

  if (!email || !email.includes("@")) {
    return { ok: false as const, error: "invalid_email" as const };
  }
  if (accountType !== "client" && accountType !== "artisan") {
    return { ok: false as const, error: "invalid_account_type" as const };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "auth" as const };

  const { data: artisanProfile } = await supabase
    .from("profiles")
    .select("id, business_name")
    .eq("user_id", user.id)
    .maybeSingle();

  let artisanId: string | null = null;
  if (accountType === "client" && artisanProfile?.id) {
    artisanId = artisanProfile.id;
  }

  const { data: existingPending } = await supabase
    .from("platform_invitations")
    .select("id, token")
    .eq("inviter_user_id", user.id)
    .eq("status", "pending")
    .eq("account_type", accountType)
    .ilike("email", email)
    .maybeSingle();

  const siteUrl = getPublicSiteUrl();
  if (existingPending?.token) {
    revalidatePaths();
    return {
      ok: true as const,
      inviteUrl: `${siteUrl}/invitation/${existingPending.token}`,
      reused: true as const,
      accountType,
    };
  }

  const { data: created, error } = await supabase
    .from("platform_invitations")
    .insert({
      inviter_user_id: user.id,
      artisan_id: artisanId,
      email,
      invited_name: invitedName,
      account_type: accountType,
    })
    .select("token")
    .single();

  if (error || !created?.token) {
    return { ok: false as const, error: "create_failed" as const };
  }

  revalidatePaths();
  return {
    ok: true as const,
    inviteUrl: `${siteUrl}/invitation/${created.token}`,
    reused: false as const,
    accountType,
  };
}

export async function cancelPlatformInvitation(invitationId: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "auth" as const };

  const { error } = await supabase
    .from("platform_invitations")
    .update({ status: "cancelled" })
    .eq("id", invitationId)
    .eq("inviter_user_id", user.id)
    .eq("status", "pending");

  if (error) return { ok: false as const, error: "update_failed" as const };
  revalidatePaths();
  return { ok: true as const };
}

function revalidatePaths() {
  revalidatePath("/app/contacts");
  revalidatePath("/compte/contacts");
  revalidatePath("/app");
  revalidatePath("/compte");
}

export async function getInvitationByToken(token: string): Promise<InvitationPreview | null> {
  const admin = createSupabaseServiceRoleClient();
  if (!admin) return null;

  const { data } = await admin
    .from("platform_invitations")
    .select(
      "token, email, invited_name, account_type, status, expires_at, inviter_user_id, artisan_id, profiles ( business_name, slug )",
    )
    .eq("token", token.trim())
    .maybeSingle();

  if (!data || data.status !== "pending") {
    const { data: legacy } = await admin
      .from("client_invitations")
      .select("token, email, invited_name, status, expires_at, profiles ( business_name, slug )")
      .eq("token", token.trim())
      .maybeSingle();
    if (!legacy || legacy.status !== "pending") return null;

    const prof = Array.isArray(legacy.profiles) ? legacy.profiles[0] : legacy.profiles;
    return {
      token: legacy.token,
      email: legacy.email,
      invitedName: legacy.invited_name,
      accountType: "client",
      inviterLabel: prof?.business_name ?? "Un artisan",
      artisanName: prof?.business_name ?? null,
      artisanSlug: prof?.slug ?? null,
      expired: new Date(legacy.expires_at) <= new Date(),
    };
  }

  const prof = Array.isArray(data.profiles) ? data.profiles[0] : data.profiles;

  let inviterLabel = prof?.business_name ?? null;
  if (!inviterLabel) {
    const { data: cp } = await admin
      .from("customer_profiles")
      .select("display_name")
      .eq("user_id", data.inviter_user_id)
      .maybeSingle();
    inviterLabel = cp?.display_name ?? null;
  }
  if (!inviterLabel) {
    const { data: ap } = await admin
      .from("profiles")
      .select("business_name")
      .eq("user_id", data.inviter_user_id)
      .maybeSingle();
    inviterLabel = ap?.business_name ?? "Un membre Soline";
  }

  return {
    token: data.token,
    email: data.email,
    invitedName: data.invited_name,
    accountType: data.account_type as PlatformAccountType,
    inviterLabel,
    artisanName: prof?.business_name ?? null,
    artisanSlug: prof?.slug ?? null,
    expired: new Date(data.expires_at) <= new Date(),
  };
}

export type AcceptInvitationResult =
  | { ok: true; accountType: PlatformAccountType; conversationId?: string }
  | { ok: false; error: string };

export async function acceptPlatformInvitation(token: string): Promise<AcceptInvitationResult> {
  const trimmed = token.trim();
  if (!trimmed) return { ok: false, error: "invalid_token" };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "auth" };

  const { data, error } = await supabase.rpc("accept_platform_invitation", { p_token: trimmed });
  if (error) {
    const { data: legacy, error: legacyErr } = await supabase.rpc("accept_client_invitation", {
      p_token: trimmed,
    });
    if (legacyErr || !legacy) return { ok: false, error: "rpc_failed" };
    const legacyResult = legacy as { ok?: boolean; error?: string; conversation_id?: string };
    if (!legacyResult?.ok) return { ok: false, error: legacyResult?.error ?? "unknown" };
    revalidateAfterAccept();
    return { ok: true, accountType: "client", conversationId: legacyResult.conversation_id };
  }

  const result = data as {
    ok?: boolean;
    error?: string;
    account_type?: PlatformAccountType;
    conversation_id?: string;
  };

  if (!result?.ok) return { ok: false, error: result?.error ?? "unknown" };

  revalidateAfterAccept();
  return {
    ok: true,
    accountType: result.account_type ?? "client",
    conversationId: result.conversation_id,
  };
}

function revalidateAfterAccept() {
  revalidatePath("/compte");
  revalidatePath("/compte/contacts");
  revalidatePath("/app");
  revalidatePath("/app/contacts");
  revalidatePath("/app/messages");
  revalidatePath("/app/reglages");
}

/** @deprecated Utiliser acceptPlatformInvitation */
export async function acceptClientInvitation(token: string) {
  return acceptPlatformInvitation(token);
}
