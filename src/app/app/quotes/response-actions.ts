"use server";

import { revalidatePath } from "next/cache";

import { requireArtisanProfileId } from "@/lib/auth/require-artisan";
import { isRejectionReason, recordArtisanAcceptance } from "@/lib/quotes/quote-response";

type Result = { ok: true } | { ok: false; error: string };

const SCAN_MAX = 5 * 1024 * 1024;

function detectScan(bytes: Uint8Array): { ext: string; type: string } | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return { ext: "jpg", type: "image/jpeg" };
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return { ext: "png", type: "image/png" };
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return { ext: "pdf", type: "application/pdf" };
  return null;
}

function refresh(quoteId: string) {
  revalidatePath(`/app/quotes/${quoteId}`);
  revalidatePath("/app/quotes");
  revalidatePath("/app");
  revalidatePath("/app/clients", "layout");
}

/** Devis signé sur papier au chantier, ou accord oral : l'artisan l'enregistre. */
export async function markQuoteAcceptedByArtisan(formData: FormData): Promise<Result> {
  const auth = await requireArtisanProfileId();
  if (!auth.ok) return { ok: false, error: "auth" };
  const { supabase, profileId } = auth;

  const quoteId = String(formData.get("quote_id") ?? "");
  const channel = formData.get("channel") === "artisan_oral" ? "artisan_oral" : "artisan_paper";
  const signerName = String(formData.get("signer_name") ?? "");
  const signedOn = String(formData.get("signed_on") ?? "") || null;

  const { data: quote } = await supabase.from("quotes").select("id, status").eq("id", quoteId).eq("artisan_id", profileId).maybeSingle();
  if (!quote) return { ok: false, error: "not_found" };
  if (quote.status !== "sent") return { ok: false, error: "not_acceptable" };

  let scanPath: string | null = null;
  const file = formData.get("scan");
  if (file instanceof File && file.size > 0) {
    if (file.size > SCAN_MAX) return { ok: false, error: "scan_too_large" };
    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = detectScan(bytes);
    if (!kind) return { ok: false, error: "scan_invalid" };
    scanPath = `${profileId}/${quoteId}/${Date.now()}.${kind.ext}`;
    const { error } = await supabase.storage.from("quote-signatures").upload(scanPath, bytes, { contentType: kind.type });
    if (error) return { ok: false, error: "scan_upload_failed" };
  }

  const res = await recordArtisanAcceptance(supabase, quoteId, profileId, { signerName, channel, signedOn, scanPath });
  if (res.ok) refresh(quoteId);
  return res;
}

export async function markQuoteRejectedByArtisan(quoteId: string, reason: string, comment: string): Promise<Result> {
  const auth = await requireArtisanProfileId();
  if (!auth.ok) return { ok: false, error: "auth" };
  if (!isRejectionReason(reason)) return { ok: false, error: "invalid_input" };
  const { data } = await auth.supabase
    .from("quotes")
    .update({
      status: "rejected",
      rejected_at: new Date().toISOString(),
      rejection_reason: reason,
      rejection_comment: comment.trim().slice(0, 1000) || null,
      response_channel: "artisan_oral",
    })
    .eq("id", quoteId)
    .eq("artisan_id", auth.profileId)
    .eq("status", "sent")
    .select("id");
  if (!data?.length) return { ok: false, error: "not_acceptable" };
  refresh(quoteId);
  return { ok: true };
}

export async function markCallbackHandled(quoteId: string): Promise<Result> {
  const auth = await requireArtisanProfileId();
  if (!auth.ok) return { ok: false, error: "auth" };
  const { error } = await auth.supabase
    .from("quotes")
    .update({ callback_handled_at: new Date().toISOString() })
    .eq("id", quoteId)
    .eq("artisan_id", auth.profileId)
    .not("callback_requested_at", "is", null);
  if (error) return { ok: false, error: "update_failed" };
  refresh(quoteId);
  return { ok: true };
}
