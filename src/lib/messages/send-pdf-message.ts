"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  MESSAGE_DOCUMENTS_BUCKET,
  messageDocumentStoragePath,
} from "@/lib/messages/document-bucket";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export async function sendMessageWithPdfAttachment(
  supabase: SupabaseClient,
  params: {
    conversationId: string;
    senderUserId: string;
    body: string;
    pdfBytes: Uint8Array;
    fileName: string;
  },
): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  const text = params.body.trim();
  if (!text || text.length > 8000) return { ok: false, error: "invalid_body" };

  const { data: message, error: messageError } = await supabase
    .from("messages")
    .insert({
      conversation_id: params.conversationId,
      sender_user_id: params.senderUserId,
      body: text,
    })
    .select("id")
    .single();

  if (messageError || !message?.id) {
    return { ok: false, error: "insert_failed" };
  }

  const storagePath = messageDocumentStoragePath(params.conversationId, params.fileName);
  const admin = createSupabaseServiceRoleClient();
  if (!admin) return { ok: false, error: "storage_unavailable" };

  const { error: uploadError } = await admin.storage
    .from(MESSAGE_DOCUMENTS_BUCKET)
    .upload(storagePath, params.pdfBytes, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadError) {
    await supabase.from("messages").delete().eq("id", message.id);
    return { ok: false, error: "upload_failed" };
  }

  const { error: attachError } = await supabase.from("message_attachments").insert({
    message_id: message.id,
    storage_bucket: MESSAGE_DOCUMENTS_BUCKET,
    storage_path: storagePath,
    kind: "file",
    file_name: params.fileName,
    mime_type: "application/pdf",
  });

  if (attachError) {
    await admin.storage.from(MESSAGE_DOCUMENTS_BUCKET).remove([storagePath]);
    await supabase.from("messages").delete().eq("id", message.id);
    return { ok: false, error: "attachment_failed" };
  }

  revalidatePath("/app/messages");
  revalidatePath("/compte/messages");

  return { ok: true, messageId: message.id };
}
