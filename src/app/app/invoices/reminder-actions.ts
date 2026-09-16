"use server";

import { revalidatePath } from "next/cache";

import { requireArtisanProfileId } from "@/lib/auth/require-artisan";
import { sendManualInvoiceReminder as sendReminder } from "@/lib/billing/invoice-reminders";

export async function sendManualInvoiceReminder(
  invoiceId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireArtisanProfileId();
  if (!auth.ok) return { ok: false, error: auth.error === "auth" ? "auth" : "profile" };
  const { supabase, profileId } = auth;

  const result = await sendReminder(supabase, invoiceId, profileId);
  if (result.ok) {
    revalidatePath(`/app/invoices/${invoiceId}`);
    revalidatePath("/app/invoices");
  }
  return result;
}
