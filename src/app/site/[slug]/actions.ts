"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { formatContactDisplayName } from "@/lib/contacts/display-name";
import { getOrCreateConversation } from "@/lib/messages/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/** Téléphone facultatif : on borne la longueur, sans imposer de format (fixe, mobile, international). */
function readPhone(formData: FormData): string | null {
  const raw = String(formData.get("customer_phone") ?? "").trim();
  if (!raw) return null;
  return raw.slice(0, 30);
}

type AdminClient = NonNullable<ReturnType<typeof createSupabaseServiceRoleClient>>;

/**
 * Réserver un créneau lie le client à l'artisan : la conversation est créée à ce moment.
 * Best-effort — un échec ici ne doit pas invalider le rendez-vous déjà enregistré.
 */
async function ensureConversationWithAdmin(admin: AdminClient, artisanId: string, customerUserId: string) {
  const { data: existing } = await admin
    .from("conversations")
    .select("id")
    .eq("artisan_id", artisanId)
    .eq("customer_user_id", customerUserId)
    .maybeSingle();

  if (existing?.id) return;

  await admin.from("conversations").insert({
    artisan_id: artisanId,
    customer_user_id: customerUserId,
  });
}

export type SubmitVitrineAppointmentResult =
  | { ok: true; mode: "done" }
  | { ok: false; error: "missing_fields" | "insert_failed" | "pending_failed" };

/**
 * Client déjà connecté : enregistre le RDV lié au compte, pas de redirection auth.
 */
export async function createAppointmentForLoggedInUser(formData: FormData): Promise<SubmitVitrineAppointmentResult> {
  const artisanId = String(formData.get("artisan_id") ?? "");
  const customerName = String(formData.get("customer_name") ?? "").trim();
  const customerEmail = String(formData.get("customer_email") ?? "").trim();
  const serviceId = String(formData.get("service_id") ?? "");
  const startTime = String(formData.get("start_time") ?? "");
  const slug = String(formData.get("slug") ?? "");

  if (!artisanId || !customerName || !customerEmail || !startTime || !slug) {
    return { ok: false, error: "missing_fields" };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) return { ok: false, error: "missing_fields" };

  const { error } = await supabase.from("appointments").insert({
    artisan_id: artisanId,
    customer_name: customerName,
    customer_email: customerEmail,
    customer_phone: readPhone(formData),
    service_id: serviceId || null,
    start_time: startTime,
    status: "pending",
    customer_user_id: user.id,
  });

  if (error) return { ok: false, error: "insert_failed" };

  // Réserver un créneau lie le client à l'artisan : la conversation est créée ici.
  // Best-effort — un échec ne doit pas invalider le rendez-vous déjà enregistré.
  await getOrCreateConversation(artisanId);

  revalidatePath(`/site/${slug}`);
  return { ok: true, mode: "done" };
}

/**
 * Invité : si l’email existe déjà → RDV + redirection connexion ; sinon → pending + redirection inscription.
 * Sans service role : comportement invité classique (RDV anonyme, pas de redirection).
 */
export async function submitVitrineAppointmentAsGuest(formData: FormData): Promise<SubmitVitrineAppointmentResult> {
  const artisanId = String(formData.get("artisan_id") ?? "");
  const customerName = String(formData.get("customer_name") ?? "").trim();
  const customerEmailRaw = String(formData.get("customer_email") ?? "").trim();
  const serviceId = String(formData.get("service_id") ?? "");
  const startTime = String(formData.get("start_time") ?? "");
  const slug = String(formData.get("slug") ?? "");

  if (!artisanId || !customerName || !customerEmailRaw || !startTime || !slug) {
    return { ok: false, error: "missing_fields" };
  }

  const customerPhone = readPhone(formData);
  const customerEmail = normalizeEmail(customerEmailRaw);
  const admin = createSupabaseServiceRoleClient();

  if (!admin) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("appointments").insert({
      artisan_id: artisanId,
      customer_name: customerName,
      customer_email: customerEmailRaw.trim(),
      customer_phone: customerPhone,
      service_id: serviceId || null,
      start_time: startTime,
      status: "pending",
      customer_user_id: null,
    });
    if (error) return { ok: false, error: "insert_failed" };
    revalidatePath(`/site/${slug}`);
    return { ok: true, mode: "done" };
  }

  const { data: existingUserId, error: rpcErr } = await admin.rpc("lookup_auth_user_id_by_email", {
    p_email: customerEmail,
  });

  if (rpcErr) return { ok: false, error: "insert_failed" };

  const authUserId = typeof existingUserId === "string" ? existingUserId : null;

  if (authUserId) {
    const { error } = await admin.from("appointments").insert({
      artisan_id: artisanId,
      customer_name: customerName,
      customer_email: customerEmailRaw.trim(),
      customer_phone: customerPhone,
      service_id: serviceId || null,
      start_time: startTime,
      status: "pending",
      customer_user_id: authUserId,
    });
    if (error) return { ok: false, error: "insert_failed" };

    await ensureConversationWithAdmin(admin, artisanId, authUserId);

    revalidatePath(`/site/${slug}`);
    const next = encodeURIComponent("/compte?success=rdv");
    const emailQ = encodeURIComponent(customerEmailRaw.trim());
    redirect(`/login?next=${next}&email=${emailQ}&info=rdv_enregistre`);
  }

  const expires = new Date();
  expires.setDate(expires.getDate() + 7);

  const { data: pendingRow, error: pendErr } = await admin
    .from("pending_vitrine_appointments")
    .insert({
      artisan_id: artisanId,
      service_id: serviceId || null,
      start_time: startTime,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhone,
      site_slug: slug,
      expires_at: expires.toISOString(),
    })
    .select("id")
    .maybeSingle();

  if (pendErr || !pendingRow?.id) return { ok: false, error: "pending_failed" };

  const nextCompte = encodeURIComponent("/compte");
  const pendingQ = encodeURIComponent(pendingRow.id);
  const emailQ = encodeURIComponent(customerEmailRaw.trim());
  redirect(`/inscription-client?next=${nextCompte}&pending=${pendingQ}&email=${emailQ}`);
}

export type FinalizePendingResult =
  | { ok: true }
  | { ok: false; error: "unauthorized" | "not_found" | "email_mismatch" | "expired" | "insert_failed" };

/**
 * Après inscription / retour sur /compte?pending=… : crée le RDV et supprime la file.
 */
export async function finalizePendingVitrineAppointment(pendingId: string): Promise<FinalizePendingResult> {
  const id = pendingId.trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "not_found" };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { ok: false, error: "unauthorized" };

  const admin = createSupabaseServiceRoleClient();
  if (!admin) return { ok: false, error: "insert_failed" };

  const { data: row, error: selErr } = await admin
    .from("pending_vitrine_appointments")
    .select("id, artisan_id, service_id, start_time, customer_name, customer_email, customer_phone, site_slug, expires_at")
    .eq("id", id)
    .maybeSingle();

  if (selErr || !row) return { ok: false, error: "not_found" };

  if (new Date(row.expires_at).getTime() < Date.now()) {
    await admin.from("pending_vitrine_appointments").delete().eq("id", id);
    return { ok: false, error: "expired" };
  }

  if (normalizeEmail(row.customer_email) !== normalizeEmail(user.email)) {
    return { ok: false, error: "email_mismatch" };
  }

  const { error: insErr } = await admin.from("appointments").insert({
    artisan_id: row.artisan_id,
    customer_name: row.customer_name,
    customer_email: row.customer_email.trim(),
    customer_phone: row.customer_phone ?? null,
    service_id: row.service_id,
    start_time: row.start_time,
    status: "pending",
    customer_user_id: user.id,
  });

  if (insErr) return { ok: false, error: "insert_failed" };

  await admin.from("customer_profiles").upsert(
    {
      user_id: user.id,
      display_name: formatContactDisplayName({
        name: row.customer_name.trim(),
        email: user.email,
      }),
      email: user.email,
    },
    { onConflict: "user_id" },
  );

  await ensureConversationWithAdmin(admin, row.artisan_id, user.id);

  await admin.from("pending_vitrine_appointments").delete().eq("id", id);

  revalidatePath(`/site/${row.site_slug}`);
  return { ok: true };
}

