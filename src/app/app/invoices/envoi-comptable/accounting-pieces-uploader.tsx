"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Paperclip, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  ACCOUNTING_ALLOWED_MIME,
  ACCOUNTING_IMAGE_JPEG_QUALITY,
  ACCOUNTING_UPLOAD_MAX_BYTES,
  ACCOUNTING_UPLOAD_MAX_FILES,
  ACCOUNTING_UPLOADS_BUCKET,
  buildAccountingUploadPath,
  jpegFilename,
  scaledImageSize,
} from "@/lib/accounting/export-schedule";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

import { deleteAccountingPiece } from "./actions";

export type PendingPieceView = { path: string; name: string; size: number };

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;
}

const COMPRESSIBLE_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

/**
 * Réduit une photo (2000 px max, JPEG) avant envoi : un ticket reste lisible et
 * l'envoi passe même avec une connexion de chantier. Si le navigateur ne sait pas
 * décoder le format (HEIC hors Safari), le fichier d'origine est conservé.
 */
async function compressPhoto(file: File): Promise<File> {
  if (!COMPRESSIBLE_MIME.includes(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const { width, height } = scaledImageSize(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#ffffff"; // PNG transparent → fond blanc
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", ACCOUNTING_IMAGE_JPEG_QUALITY),
    );
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], jpegFilename(file.name), { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/**
 * Ajout de plusieurs pièces à la fois (photos de factures d'achat, tickets CB, PDF).
 * Envoi direct du navigateur vers le stockage privé : pas de limite de taille de
 * requête serveur, et une connexion instable n'interrompt que le fichier en cours.
 */
export function AccountingPiecesUploader({
  profileId,
  initialPieces,
}: {
  profileId: string;
  initialPieces: PendingPieceView[];
}) {
  const router = useRouter();
  const [pieces, setPieces] = React.useState(initialPieces);
  const [uploading, setUploading] = React.useState<{ done: number; total: number } | null>(null);
  const [deleting, setDeleting] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function onPick(fileList: FileList | null) {
    if (!fileList?.length) return;
    const room = ACCOUNTING_UPLOAD_MAX_FILES - pieces.length;
    if (room <= 0) {
      toast.error(`${ACCOUNTING_UPLOAD_MAX_FILES} pièces maximum par envoi.`);
      return;
    }
    const files = Array.from(fileList).slice(0, room);
    const supabase = createSupabaseBrowserClient();
    const added: PendingPieceView[] = [];
    let failed = 0;
    setUploading({ done: 0, total: files.length });

    try {
      for (const [index, original] of files.entries()) {
        const file = (ACCOUNTING_ALLOWED_MIME as readonly string[]).includes(original.type)
          ? await compressPhoto(original)
          : original;
        if (!(ACCOUNTING_ALLOWED_MIME as readonly string[]).includes(file.type)) {
          toast.error(`${file.name} : format non accepté (photo ou PDF).`);
          failed++;
        } else if (file.size > ACCOUNTING_UPLOAD_MAX_BYTES) {
          toast.error(`${original.name} : 5 Mo maximum.`);
          failed++;
        } else {
          const path = buildAccountingUploadPath(profileId, file.name, Date.now(), crypto.randomUUID().slice(0, 8));
          const { error } = await supabase.storage
            .from(ACCOUNTING_UPLOADS_BUCKET)
            .upload(path, file, { upsert: false, contentType: file.type, cacheControl: "0" });
          if (error) {
            toast.error(`Échec de l'envoi de ${file.name}. Réessayez.`);
            failed++;
          } else {
            added.push({ path, name: file.name, size: file.size });
          }
        }
        setUploading({ done: index + 1, total: files.length });
      }
    } finally {
      setUploading(null);
      if (inputRef.current) inputRef.current.value = "";
    }

    if (added.length) {
      setPieces((prev) => [...prev, ...added]);
      toast.success(
        `${added.length} pièce${added.length > 1 ? "s" : ""} ajoutée${added.length > 1 ? "s" : ""} au prochain envoi.`,
      );
      router.refresh();
    } else if (!failed) {
      toast.error("Aucune pièce ajoutée.");
    }
  }

  async function onDelete(path: string) {
    setDeleting(path);
    const res = await deleteAccountingPiece(path);
    setDeleting(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setPieces((prev) => prev.filter((p) => p.path !== path));
    toast.success("Pièce retirée.");
  }

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCOUNTING_ALLOWED_MIME.join(",")}
        className="hidden"
        onChange={(event) => void onPick(event.target.files)}
      />
      <Button
        type="button"
        size="lg"
        className="w-full gap-2 sm:w-auto"
        disabled={uploading != null}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? <Loader2 className="size-5 animate-spin" /> : <Paperclip className="size-5" />}
        {uploading ? `Envoi ${uploading.done}/${uploading.total}…` : "Ajouter"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Photos ou PDF, plusieurs à la fois, 5 Mo max par pièce (les photos sont réduites automatiquement). Elles partent avec vos factures
        au prochain envoi puis sont supprimées : Soline n&apos;en garde aucune copie.
      </p>

      {pieces.length > 0 ? (
        <ul className="divide-y rounded-xl border bg-card">
          {pieces.map((piece) => (
            <li key={piece.path} className="flex items-center gap-3 px-4 py-3 text-sm">
              <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{piece.name}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatSize(piece.size)}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Retirer ${piece.name}`}
                disabled={deleting === piece.path}
                onClick={() => void onDelete(piece.path)}
              >
                {deleting === piece.path ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          Aucune pièce en attente pour le prochain envoi.
        </p>
      )}
    </div>
  );
}
