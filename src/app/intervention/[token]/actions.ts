"use server";

import { revalidatePath } from "next/cache";

import { allowRequest, RATE_LIMITS } from "@/lib/security/rate-limit";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export async function signPublicWorkOrder(
  token: string,
  signerName: string,
  signatureData: string,
  workPerformed?: string,
  materialsUsed?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // RPC réservée au serveur (migration 55), authentifiée par le jeton du bon.
  const supabase = createSupabaseServiceRoleClient();
  if (!supabase) return { ok: false, error: "rpc_failed" };
  if (!(await allowRequest(RATE_LIMITS.workOrderSign, supabase))) return { ok: false, error: "rate_limited" };
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
