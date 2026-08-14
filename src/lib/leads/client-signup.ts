"use server";

import type { LeadSignupOffer } from "@/lib/leads/client-signup-types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Prépare une invitation client liée au lead (idempotent). N'échoue jamais silencieusement côté UX. */
export async function prepareLeadClientSignup(token: string): Promise<LeadSignupOffer> {
  const empty: LeadSignupOffer = {
    canSignup: false,
    email: null,
    name: null,
    inviteToken: null,
    claimOnly: false,
  };

  if (!token?.trim()) return empty;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_lead_client_invitation", {
    p_token: token.trim(),
  });

  if (error) {
    console.error("[lead-signup] create_lead_client_invitation", error.message);
    return empty;
  }

  const payload = data as
    | {
        ok?: boolean;
        error?: string;
        email?: string;
        name?: string;
        invite_token?: string | null;
        claim_only?: boolean;
      }
    | null;

  if (!payload?.ok) return empty;

  return {
    canSignup: true,
    email: payload.email ?? null,
    name: payload.name ?? null,
    inviteToken: payload.invite_token ?? null,
    claimOnly: !!payload.claim_only,
  };
}

export async function getLeadSignupPreview(token: string): Promise<LeadSignupOffer & { ok: boolean }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("lead_signup_preview", { p_token: token.trim() });

  if (error || !data) {
    return { ok: false, canSignup: false, email: null, name: null, inviteToken: null, claimOnly: false };
  }

  const payload = data as {
    ok?: boolean;
    name?: string;
    email?: string;
    has_email?: boolean;
  };

  if (!payload.ok) {
    return { ok: false, canSignup: false, email: null, name: null, inviteToken: null, claimOnly: false };
  }

  return {
    ok: true,
    canSignup: !!payload.has_email,
    email: payload.email ?? null,
    name: payload.name ?? null,
    inviteToken: null,
    claimOnly: false,
  };
}

export async function claimLeadByToken(
  token: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!token?.trim()) return { ok: false, error: "missing_token" };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "auth" };

  const { data, error } = await supabase.rpc("claim_lead", { p_token: token.trim() });
  if (error) {
    console.error("[lead-signup] claim_lead", error.message);
    return { ok: false, error: "rpc_failed" };
  }

  const payload = data as { ok?: boolean; error?: string } | null;
  if (!payload?.ok) return { ok: false, error: payload?.error ?? "claim_failed" };
  return { ok: true };
}
