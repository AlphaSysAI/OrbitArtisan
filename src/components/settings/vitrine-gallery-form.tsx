"use client";

import Image from "next/image";
import * as React from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  deleteVitrineGalleryImage,
  registerVitrineGalleryImage,
  type VitrineGalleryActionResult,
} from "@/app/app/profile/vitrine-gallery-actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  extensionForVitrineMime,
  isAllowedVitrineImageMime,
  VITRINE_GALLERY_MAX_IMAGES,
  VITRINE_MEDIA_BUCKET,
  vitrineMediaPublicUrl,
  type VitrineGalleryImage,
} from "@/lib/vitrine/gallery";

function actionErrorMessage(error: string): string {
  switch (error) {
    case "limit":
      return `Maximum ${VITRINE_GALLERY_MAX_IMAGES} photos sur la vitrine.`;
    case "auth":
      return "Connecte-toi pour gérer ta galerie.";
    case "invalid_path":
      return "Chemin de fichier invalide.";
    case "not_found":
      return "Photo introuvable.";
    default:
      return "Impossible de mettre à jour la galerie.";
  }
}

export function VitrineGalleryForm({
  artisanId,
  initialImages,
}: {
  artisanId: string;
  initialImages: VitrineGalleryImage[];
}) {
  const [images, setImages] = React.useState(initialImages);
  const [uploading, setUploading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const onPickFiles = async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    const remaining = VITRINE_GALLERY_MAX_IMAGES - images.length;
    if (remaining <= 0) {
      toast.error(actionErrorMessage("limit"));
      return;
    }

    const files = Array.from(fileList).slice(0, remaining);
    setUploading(true);
    const supabase = createSupabaseBrowserClient();

    try {
      for (const file of files) {
        if (!isAllowedVitrineImageMime(file.type)) {
          toast.error(`${file.name} : format non supporté (JPEG, PNG, WebP, GIF).`);
          continue;
        }
        const ext = extensionForVitrineMime(file.type);
        if (!ext) continue;

        const path = `${artisanId}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from(VITRINE_MEDIA_BUCKET).upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type,
        });

        if (uploadError) {
          toast.error(`Échec envoi ${file.name}.`);
          continue;
        }

        const reg: VitrineGalleryActionResult = await registerVitrineGalleryImage({ storagePath: path });
        if (!reg.ok) {
          await supabase.storage.from(VITRINE_MEDIA_BUCKET).remove([path]);
          toast.error(actionErrorMessage(reg.error));
          continue;
        }

        setImages((prev) => [
          ...prev,
          {
            id: path,
            storage_path: path,
            caption: null,
            sort_order: prev.length,
            created_at: new Date().toISOString(),
          },
        ]);
      }
      toast.success("Galerie mise à jour.");
      window.location.reload();
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onDelete = async (imageId: string) => {
    const res = await deleteVitrineGalleryImage(imageId);
    if (!res.ok) {
      toast.error(actionErrorMessage(res.error));
      return;
    }
    setImages((prev) => prev.filter((i) => i.id !== imageId));
    toast.success("Photo retirée.");
  };

  return (
    <div className="space-y-4 rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
      <div className="space-y-1">
        <Label className="text-base">Photos de ta vitrine</Label>
        <p className="text-sm text-muted-foreground">
          Chantiers, équipe, certifications… Jusqu&apos;à {VITRINE_GALLERY_MAX_IMAGES} images affichées sur{" "}
          <span className="font-mono text-xs">/site/…</span>.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {images.map((img) => {
          const url = vitrineMediaPublicUrl(img.storage_path);
          return (
            <div
              key={img.id}
              className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-border/70 bg-muted/40"
            >
              {url ? (
                <Image src={url} alt="" fill className="object-cover" sizes="200px" unoptimized />
              ) : null}
              <Button
                type="button"
                variant="destructive"
                size="icon-sm"
                className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100"
                onClick={() => onDelete(img.id)}
                aria-label="Supprimer la photo"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          );
        })}

        {images.length < VITRINE_GALLERY_MAX_IMAGES ? (
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted/40 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="size-6 animate-spin" /> : <ImagePlus className="size-6" />}
            Ajouter
          </button>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={(e) => onPickFiles(e.target.files)}
      />
    </div>
  );
}
