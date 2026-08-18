"use server";

import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function acceptPublicQuote(
  token: string,
  signerName: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("public_accept_quote", {
    p_token: token,
    p_signer_name: signerName,
  });

  if (error || !data) return { ok: false, error: "rpc_failed" };
  const result = data as { ok?: boolean; error?: string };
  if (!result.ok) return { ok: false, error: result.error ?? "failed" };

  revalidatePath(`/devis/${token}`);
  return { ok: true };
}
