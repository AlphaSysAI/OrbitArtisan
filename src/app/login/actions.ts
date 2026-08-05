"use server";

import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function signInWithPassword(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/app");
  const role = String(formData.get("role") ?? "").trim();

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const roleParam = role ? `&role=${encodeURIComponent(role)}` : "";
    redirect(`/login?next=${encodeURIComponent(next)}${roleParam}&error=invalid_credentials`);
  }
  redirect(next);
}

export async function signUpWithPassword(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/app");
  const invite = String(formData.get("invite") ?? "").trim();

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const callbackNext = invite ? `/app/reglages?tab=activite&invite=${encodeURIComponent(invite)}` : next;

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(callbackNext)}`,
    },
  });

  if (error) redirect(`/login?error=signup_failed`);

  const q = invite ? `&invite=${encodeURIComponent(invite)}&email=${encodeURIComponent(email)}` : "";
  redirect(`/login?success=check_email${q}`);
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}

