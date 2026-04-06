"use server";

import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function clientAcceptQuote(quoteId: string, signerName: string) {
  const name = signerName.trim();
  if (name.length < 2) {
    return { ok: false as const, error: "invalid_name" as const };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "auth" as const };

  const { error } = await supabase.rpc("client_accept_quote", {
    p_quote_id: quoteId,
    p_signer_name: name,
  });

  if (error) return { ok: false as const, error: "rpc" as const };

  revalidatePath(`/mes-devis/${quoteId}`);
  revalidatePath("/mes-devis");
  revalidatePath("/compte");
  revalidatePath("/app/quotes");
  revalidatePath(`/app/quotes/${quoteId}`);
  revalidatePath("/app/invoices");
  return { ok: true as const };
}

export async function clientRejectQuote(quoteId: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "auth" as const };

  const { error } = await supabase.rpc("client_reject_quote", {
    p_quote_id: quoteId,
  });

  if (error) return { ok: false as const, error: "rpc" as const };

  revalidatePath(`/mes-devis/${quoteId}`);
  revalidatePath("/mes-devis");
  revalidatePath("/compte");
  revalidatePath("/app/quotes");
  revalidatePath(`/app/quotes/${quoteId}`);
  revalidatePath("/app/invoices");
  return { ok: true as const };
}
