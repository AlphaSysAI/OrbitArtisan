"use server";

import { revalidatePath } from "next/cache";

import { sendManualInvoiceReminder as sendReminder } from "@/lib/billing/invoice-reminders";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function sendManualInvoiceReminder(
  invoiceId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "auth" };

  const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user.id).maybeSingle();
  if (!profile?.id) return { ok: false, error: "profile" };

  const result = await sendReminder(supabase, invoiceId, profile.id);
  if (result.ok) {
    revalidatePath(`/app/invoices/${invoiceId}`);
    revalidatePath("/app/invoices");
  }
  return result;
}
