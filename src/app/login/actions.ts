"use server";

import { redirect } from "next/navigation";

import { buildEmailConfirmationRedirect, sanitizeEmailParam } from "@/lib/auth/email-confirmation";
import { safeNextPath } from "@/lib/auth/safe-next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicSiteUrl } from "@/lib/site-url";

export async function signInWithPassword(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(String(formData.get("next") ?? ""), "/app");
  const role = String(formData.get("role") ?? "").trim();

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const qs = new URLSearchParams({ next, error: /not.?confirmed/i.test(error.message) ? "email_not_confirmed" : "invalid_credentials" });
    if (role) qs.set("role", role);
    const cleanEmail = sanitizeEmailParam(email);
    if (cleanEmail) qs.set("email", cleanEmail);
    redirect(`/login?${qs.toString()}`);
  }
  redirect(next);
}

/** Renvoie le mail de confirmation d'inscription (lien expiré, mail introuvable…). */
export async function resendConfirmationEmail(formData: FormData) {
  const email = sanitizeEmailParam(String(formData.get("email") ?? ""));
  const next = safeNextPath(String(formData.get("next") ?? ""), "/app/onboarding");
  const role = String(formData.get("role") ?? "artisan") === "particulier" ? "particulier" : "artisan";
  const qs = new URLSearchParams({ role, next });

  if (!email) {
    qs.set("error", "resend_failed");
    redirect(`/login?${qs.toString()}`);
  }
  qs.set("email", email);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: buildEmailConfirmationRedirect(getPublicSiteUrl(), next, email) },
  });

  if (error) {
    console.error("[login] resend", { code: error.code ?? null, status: error.status ?? null });
    const rateLimited = error.status === 429 || /rate.?limit|security purposes/i.test(`${error.code ?? ""} ${error.message}`);
    qs.set("error", rateLimited ? "resend_rate_limited" : "resend_failed");
    redirect(`/login?${qs.toString()}`);
  }

  qs.set("success", "check_email");
  qs.set("resent", "1");
  redirect(`/login?${qs.toString()}`);
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}
