import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/** Bucket privé : tous les accès passent par des URL signées côté serveur. */
export const RECOVERY_DOCUMENTS_BUCKET = "recovery-documents";

/** Durée de validité des URL signées transmises aux prestataires (7 jours). */
export const RECOVERY_SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60;

export type RecoveryDocumentKind =
  | "formal-notice"
  | "filing-proof"
  | "delivery-proof"
  | "return-proof"
  | "invoice"
  | "signed-quote";

export type StorageResult<T> = { ok: true; data: T } | { ok: false; error: string };

function slugify(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 60) || "document"
  );
}

/** Chemin déterministe `{artisanId}/{invoiceId}/{kind}-{suffixe}.pdf`. */
export function buildRecoveryDocumentPath(input: {
  artisanId: string;
  invoiceId: string;
  kind: RecoveryDocumentKind;
  suffix?: string;
}): string {
  const suffix = input.suffix ? `-${slugify(input.suffix)}` : "";
  return `${input.artisanId}/${input.invoiceId}/${input.kind}${suffix}.pdf`;
}

/** Dépose un PDF dans le bucket de recouvrement (client service role requis). */
export async function uploadRecoveryDocument(
  admin: SupabaseClient,
  path: string,
  pdf: Uint8Array,
): Promise<StorageResult<string>> {
  const { error } = await admin.storage.from(RECOVERY_DOCUMENTS_BUCKET).upload(
    path,
    // `Buffer` garantit un corps binaire stable côté Node.
    Buffer.from(pdf),
    { contentType: "application/pdf", upsert: true },
  );

  if (error) {
    console.error("[recovery-storage] upload", { path, message: error.message });
    return { ok: false, error: `storage_upload_failed: ${error.message}` };
  }

  return { ok: true, data: path };
}

/** Génère une URL signée temporaire pour un document du bucket. */
export async function createRecoveryDocumentSignedUrl(
  admin: SupabaseClient,
  path: string,
  expiresIn: number = RECOVERY_SIGNED_URL_TTL_SECONDS,
): Promise<StorageResult<string>> {
  const { data, error } = await admin.storage
    .from(RECOVERY_DOCUMENTS_BUCKET)
    .createSignedUrl(path, expiresIn);

  if (error || !data?.signedUrl) {
    const message = error?.message ?? "signed_url_missing";
    console.error("[recovery-storage] signed url", { path, message });
    return { ok: false, error: `storage_signed_url_failed: ${message}` };
  }

  return { ok: true, data: data.signedUrl };
}

/** Télécharge un document du bucket (réutilisation des preuves déjà archivées). */
export async function downloadRecoveryDocument(
  admin: SupabaseClient,
  path: string,
): Promise<StorageResult<Uint8Array>> {
  const { data, error } = await admin.storage.from(RECOVERY_DOCUMENTS_BUCKET).download(path);

  if (error || !data) {
    const message = error?.message ?? "download_empty";
    return { ok: false, error: `storage_download_failed: ${message}` };
  }

  return { ok: true, data: new Uint8Array(await data.arrayBuffer()) };
}
