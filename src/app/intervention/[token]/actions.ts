"use server";

import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function signPublicWorkOrder(
  token: string,
  signerName: string,
  signatureData: string,
  workPerformed?: string,
  materialsUsed?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("public_sign_work_order", {
    p_token: token,
    p_signer_name: signerName,
    p_signature_data: signatureData,
    p_work_performed: workPerformed ?? null,
    p_materials_used: materialsUsed ?? null,
  });

  if (error || !data) return { ok: false, error: "rpc_failed" };
  const result = data as { ok?: boolean; error?: string };
  if (!result.ok) return { ok: false, error: result.error ?? "failed" };

  revalidatePath(`/intervention/${token}`);
  return { ok: true };
}
