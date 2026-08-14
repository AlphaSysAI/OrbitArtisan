"use client";

import * as React from "react";
import { Camera, ImagePlus, Loader2, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { StepShell } from "@/components/trades/trade-picker";
import { LEAD_MEDIA_BUCKET } from "@/lib/leads/types";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

import { createLeadUploadUrl, registerLeadMedia } from "./actions";

const MAX_FILES = 3;
const MAX_BYTES = 50 * 1024 * 1024;
const ACCEPTED = "image/jpeg,image/png,image/webp,image/heic,video/mp4,video/quicktime";

/**
 * Les fichiers restent locaux jusqu'au « Continuer » : tant que le prospect
 * n'a pas validé, retirer une photo n'a rien à défaire côté serveur (un lead
 * anonyme ne peut pas supprimer ses médias).
 */
type StagedFile = { id: string; file: File; previewUrl: string | null };

export function MediaStep({
  token,
  onBack,
  onDone,
}: {
  token: string;
  onBack: () => void;
  onDone: (uploadedCount: number) => void;
}) {
  const [files, setFiles] = React.useState<StagedFile[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const cameraInputRef = React.useRef<HTMLInputElement>(null);
  const previewUrlsRef = React.useRef<string[]>([]);

  React.useEffect(() => {
    const urls = previewUrlsRef.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  function addFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    const room = MAX_FILES - files.length;
    if (room <= 0) {
      toast.message(`${MAX_FILES} fichiers maximum.`);
      return;
    }

    const staged: StagedFile[] = [];
    for (const file of Array.from(fileList).slice(0, room)) {
      if (file.size > MAX_BYTES) {
        toast.error(`${file.name} dépasse 50 Mo.`);
        continue;
      }
      const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
      if (previewUrl) previewUrlsRef.current.push(previewUrl);
      staged.push({ id: `${file.name}-${file.size}-${crypto.randomUUID()}`, file, previewUrl });
    }
    if (staged.length) setFiles((prev) => [...prev, ...staged]);
  }

  async function uploadOne(file: File): Promise<boolean> {
    const kind: "photo" | "video" = file.type.startsWith("video/") ? "video" : "photo";

    const signed = await createLeadUploadUrl({ token, fileName: file.name });
    if (!signed.ok) return false;

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.storage
      .from(LEAD_MEDIA_BUCKET)
      .uploadToSignedUrl(signed.path, signed.signedToken, file, { contentType: file.type });
    if (error) {
      console.error("[estimation] upload", error.message);
      return false;
    }

    const registered = await registerLeadMedia({ token, path: signed.path, kind });
    return registered.ok;
  }

  async function submit() {
    if (!files.length) {
      onDone(0);
      return;
    }

    setUploading(true);
    let uploaded = 0;
    for (const staged of files) {
      const ok = await uploadOne(staged.file);
      if (ok) uploaded += 1;
      else toast.error(`Échec de l’envoi de ${staged.file.name}.`);
    }
    setUploading(false);

    if (uploaded === 0) {
      toast.error("Aucun fichier n’a pu être envoyé. Tu peux continuer sans photo.");
      return;
    }
    onDone(uploaded);
  }

  const full = files.length >= MAX_FILES;

  return (
    <StepShell
      title="Ajoute des photos"
      subtitle="2 ou 3 photos, ou une courte vidéo — c’est ce qui rend l’estimation fiable"
      onBack={onBack}
    >
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed bg-card px-6 py-10 text-center transition-colors",
          dragging && "border-primary bg-primary/5",
          full && "opacity-60",
        )}
      >
        <UploadCloud className="h-9 w-9 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Glisse tes fichiers ici, ou choisis-les sur ton appareil.
        </p>

        <div className="flex flex-wrap justify-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            disabled={uploading || full}
            onClick={() => fileInputRef.current?.click()}
          >
            <ImagePlus className="h-4 w-4" />
            Choisir un fichier
          </Button>
          <Button
            type="button"
            variant="outline"
            className="gap-2 sm:hidden"
            disabled={uploading || full}
            onClick={() => cameraInputRef.current?.click()}
          >
            <Camera className="h-4 w-4" />
            Prendre une photo
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          {files.length} / {MAX_FILES} · JPEG, PNG, WEBP, HEIC, MP4 · 50 Mo max
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED}
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {files.length > 0 && (
        <ul className="grid grid-cols-3 gap-3">
          {files.map((staged) => (
            <li key={staged.id} className="relative overflow-hidden rounded-xl border bg-muted">
              {staged.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- aperçu local (blob), pas de source distante
                <img src={staged.previewUrl} alt="" className="aspect-square w-full object-cover" />
              ) : (
                <div className="flex aspect-square w-full flex-col items-center justify-center gap-1 px-2 text-center">
                  <Camera className="h-5 w-5 text-muted-foreground" />
                  <span className="truncate text-[11px] text-muted-foreground">{staged.file.name}</span>
                </div>
              )}
              <button
                type="button"
                disabled={uploading}
                onClick={() => setFiles((prev) => prev.filter((f) => f.id !== staged.id))}
                className="absolute right-1.5 top-1.5 rounded-lg bg-background/90 p-1.5 text-destructive shadow-sm disabled:opacity-50"
                aria-label={`Retirer ${staged.file.name}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={() => onDone(0)} disabled={uploading}>
          Passer cette étape
        </Button>
        <Button type="button" size="lg" onClick={() => void submit()} disabled={uploading || !files.length}>
          {uploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Envoi…
            </>
          ) : (
            "Continuer"
          )}
        </Button>
      </div>
    </StepShell>
  );
}
