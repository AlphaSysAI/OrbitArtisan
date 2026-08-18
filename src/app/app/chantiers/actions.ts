"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function createProject(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  const clientName = String(formData.get("client_name") ?? "").trim() || null;
  const quoteId = String(formData.get("quote_id") ?? "").trim() || null;
  const budgetEur = String(formData.get("budget_eur") ?? "").trim();

  if (!name) return;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user.id).maybeSingle();
  if (!profile?.id) return;

  let budgetTotalCents = 0;
  if (budgetEur) {
    const n = Number(budgetEur.replace(",", "."));
    if (Number.isFinite(n)) budgetTotalCents = Math.round(n * 100);
  }

  if (quoteId) {
    const { data: quote } = await supabase
      .from("quotes")
      .select("grand_total, labor_total, materials_total")
      .eq("id", quoteId)
      .eq("artisan_id", profile.id)
      .maybeSingle();
    if (quote) {
      budgetTotalCents = quote.grand_total ?? budgetTotalCents;
    }
  }

  const { data: project, error } = await supabase
    .from("projects")
    .insert({
      artisan_id: profile.id,
      quote_id: quoteId,
      name,
      client_name: clientName,
      budget_total_cents: budgetTotalCents,
      budget_labor_cents: 0,
      budget_materials_cents: 0,
    })
    .select("id")
    .single();

  if (error || !project?.id) return;

  if (quoteId) {
    await supabase.from("quotes").update({ project_id: project.id }).eq("id", quoteId);
  }

  revalidatePath("/app/chantiers");
  redirect(`/app/chantiers/${project.id}`);
}

export async function addTimeEntry(formData: FormData): Promise<void> {
  const projectId = String(formData.get("project_id") ?? "").trim();
  const durationMinutes = Number(formData.get("duration_minutes"));
  const description = String(formData.get("description") ?? "").trim() || null;
  const workerName = String(formData.get("worker_name") ?? "").trim() || null;
  const hourlyRateEur = String(formData.get("hourly_rate_eur") ?? "").trim();

  if (!projectId || !Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("id, labor_rate_per_hour").eq("user_id", user.id).maybeSingle();
  if (!profile?.id) return;

  let hourlyRateCents = profile.labor_rate_per_hour ?? 4500;
  if (hourlyRateEur) {
    const n = Number(hourlyRateEur.replace(",", "."));
    if (Number.isFinite(n)) hourlyRateCents = Math.round(n * 100);
  }

  const costCents = Math.round((hourlyRateCents * durationMinutes) / 60);

  const { error } = await supabase.from("project_time_entries").insert({
    project_id: projectId,
    artisan_id: profile.id,
    duration_minutes: Math.round(durationMinutes),
    hourly_rate_cents: hourlyRateCents,
    cost_cents: costCents,
    description,
    worker_name: workerName,
  });

  if (error) return;

  revalidatePath(`/app/chantiers/${projectId}`);
  revalidatePath("/app/chantiers");
}

export async function createWorkOrder(formData: FormData): Promise<void> {
  const title = String(formData.get("title") ?? "").trim();
  const clientName = String(formData.get("client_name") ?? "").trim() || null;
  const description = String(formData.get("description") ?? "").trim() || null;
  const siteAddress = String(formData.get("site_address") ?? "").trim() || null;
  const projectId = String(formData.get("project_id") ?? "").trim() || null;
  const quoteId = String(formData.get("quote_id") ?? "").trim() || null;

  if (!title) return;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user.id).maybeSingle();
  if (!profile?.id) return;

  const ref = `BI-${Date.now().toString(36).toUpperCase()}`;

  const { error } = await supabase
    .from("work_orders")
    .insert({
      artisan_id: profile.id,
      project_id: projectId,
      quote_id: quoteId,
      title,
      client_name: clientName,
      description,
      site_address: siteAddress,
      reference_number: ref,
      status: "sent",
    });

  if (error) return;

  revalidatePath("/app/interventions");
  redirect("/app/interventions");
}

export async function createSupplier(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user.id).maybeSingle();
  if (!profile?.id) return;

  const { error } = await supabase.from("suppliers").insert({
    artisan_id: profile.id,
    name,
    contact_name: String(formData.get("contact_name") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
    siret: String(formData.get("siret") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
  });

  if (error) return;

  revalidatePath("/app/fournisseurs");
  redirect("/app/fournisseurs");
}
