"use server";

import { revalidatePath } from "next/cache";

import {
  notifyQuoteAccepted,
  notifyQuoteRejected,
} from "@/lib/notifications/notify-events";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

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

  const { data: quote } = await supabase
    .from("quotes")
    .select("artisan_id")
    .eq("id", quoteId)
    .maybeSingle();

  const { error } = await supabase.rpc("client_accept_quote", {
    p_quote_id: quoteId,
    p_signer_name: name,
  });

  if (error) return { ok: false as const, error: "rpc" as const };

  const admin = createSupabaseServiceRoleClient();
  if (admin && quote?.artisan_id) {
    void notifyQuoteAccepted(admin, {
      quoteId,
      artisanId: quote.artisan_id as string,
      signerName: name,
    });
  }

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

  const { data: quote } = await supabase
    .from("quotes")
    .select("artisan_id")
    .eq("id", quoteId)
    .maybeSingle();

  const { error } = await supabase.rpc("client_reject_quote", {
    p_quote_id: quoteId,
  });

  if (error) return { ok: false as const, error: "rpc" as const };

  const admin = createSupabaseServiceRoleClient();
  if (admin && quote?.artisan_id) {
    void notifyQuoteRejected(admin, {
      quoteId,
      artisanId: quote.artisan_id as string,
    });
  }

  revalidatePath(`/mes-devis/${quoteId}`);
  revalidatePath("/mes-devis");
  revalidatePath("/compte");
  revalidatePath("/app/quotes");
  revalidatePath(`/app/quotes/${quoteId}`);
  revalidatePath("/app/invoices");
  return { ok: true as const };
}
