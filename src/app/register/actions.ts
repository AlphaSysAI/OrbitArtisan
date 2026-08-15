"use server";

import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicSiteUrl } from "@/lib/site-url";

function registerRedirect(params: Record<string, string | undefined>) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) qs.set(key, value);
  }
  const query = qs.toString();
  redirect(query ? `/register?${query}` : "/register");
}

export async function signUpWithPassword(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("password_confirm") ?? "");
  const next = String(formData.get("next") ?? "/app");
  const invite = String(formData.get("invite") ?? "").trim();
  const role = String(formData.get("role") ?? "artisan").trim();

  const baseParams = {
    next,
    role,
    email,
    invite: invite || undefined,
  };

  if (password.length < 8) {
    registerRedirect({ ...baseParams, error: "password_too_short" });
  }

  if (password !== passwordConfirm) {
    registerRedirect({ ...baseParams, error: "password_mismatch" });
  }

  const siteUrl = getPublicSiteUrl();
  const callbackNext = invite ? `/app/reglages?tab=activite&invite=${encodeURIComponent(invite)}` : next;

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(callbackNext)}`,
    },
  });

  if (error) registerRedirect({ ...baseParams, error: "signup_failed" });

  const q = new URLSearchParams({ success: "check_email" });
  if (invite) q.set("invite", invite);
  if (email) q.set("email", email);
  redirect(`/login?${q.toString()}`);
}
