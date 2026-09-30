"use client";

import * as React from "react";
import { ImageUp, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { removeArtisanLogo, uploadArtisanLogo } from "@/app/app/profile/logo-actions";
import { Button } from "@/components/ui/button";
import { LOGO_MAX_BYTES, LOGO_MAX_SIDE_PX } from "@/lib/branding/logo";

const ERRORS: Record<string, string> = {
  too_large: "Image trop lourde, même après compression. Essaie un fichier plus simple.",
  invalid_type: "Format non reconnu. Utilise une image PNG ou JPEG.",
  upload_failed: "L'envoi a échoué. Vérifie ta connexion et réessaie.",
  update_failed: "Logo envoyé mais non enregistré. Réessaie.",
  auth: "Session expirée : reconnecte-toi.",
};

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Redimensionne dans le navigateur (≤ 800 px) et convertit en PNG/JPEG :
 * léger à envoyer depuis le chantier, et toujours lisible par le générateur PDF
 * (WebP, SVG ou photo iPhone deviennent un PNG/JPEG standard).
 */
async function normalizeLogo(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode"));
      el.src = url;
    });
    const w0 = img.naturalWidth || LOGO_MAX_SIDE_PX;
    const h0 = img.naturalHeight || LOGO_MAX_SIDE_PX;
    const scale = Math.min(1, LOGO_MAX_SIDE_PX / Math.max(w0, h0));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w0 * scale));
    canvas.height = Math.max(1, Math.round(h0 * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");

    const photo = file.type === "image/jpeg" || file.type === "image/heic";
    if (photo) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    let blob = photo ? await canvasToBlob(canvas, "image/jpeg", 0.9) : await canvasToBlob(canvas, "image/png");
    if (blob && blob.size > LOGO_MAX_BYTES) {
      // PNG trop lourd (logo photographique) : repli JPEG sur fond blanc.
      const flat = document.createElement("canvas");
      flat.width = canvas.width;
      flat.height = canvas.height;
      const fctx = flat.getContext("2d")!;
      fctx.fillStyle = "#fff";
      fctx.fillRect(0, 0, flat.width, flat.height);
      fctx.drawImage(canvas, 0, 0);
      blob = await canvasToBlob(flat, "image/jpeg", 0.85);
    }
    if (!blob) throw new Error("encode");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function LogoUploadField({ initialLogoUrl }: { initialLogoUrl: string | null }) {
  const [logoUrl, setLogoUrl] = React.useState(initialLogoUrl);
  const [pending, setPending] = React.useState<"upload" | "remove" | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error("Fichier trop lourd (20 Mo max).");
      return;
    }
    setPending("upload");
    try {
      const blob = await normalizeLogo(file);
      const fd = new FormData();
      fd.set("logo", new File([blob], blob.type === "image/png" ? "logo.png" : "logo.jpg", { type: blob.type }));
      const res = await uploadArtisanLogo(fd);
      if (!res.ok) {
        toast.error(ERRORS[res.error] ?? "Impossible d'enregistrer le logo.");
        return;
      }
      setLogoUrl(res.logoUrl);
      toast.success("Logo enregistré. Il apparaît sur tes prochains devis et factures.");
    } catch {
      toast.error("Image illisible. Essaie un PNG ou un JPEG.");
    } finally {
      setPending(null);
    }
  }

  async function onRemove() {
    setPending("remove");
    const res = await removeArtisanLogo();
    setPending(null);
    if (!res.ok) {
      toast.error("Impossible de retirer le logo.");
      return;
    }
    setLogoUrl(null);
    toast.message("Logo retiré.");
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-20 w-40 items-center justify-center overflow-hidden rounded-xl border bg-white p-2">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Ton logo" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-center text-xs text-muted-foreground">Aucun logo</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="gap-2"
            disabled={pending !== null}
            onClick={() => inputRef.current?.click()}
          >
            {pending === "upload" ? <Loader2 className="size-4 animate-spin" /> : <ImageUp className="size-4" />}
            {logoUrl ? "Remplacer" : "Importer mon logo"}
          </Button>
          {logoUrl ? (
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="gap-2 text-muted-foreground"
              disabled={pending !== null}
              onClick={() => void onRemove()}
            >
              {pending === "remove" ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Retirer
            </Button>
          ) : null}
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => void onFile(e)} />
      <p className="text-sm text-muted-foreground">
        Affiché en tête de tes devis, factures et de ta page vitrine. Idéal : PNG à fond transparent, format horizontal.
      </p>
    </div>
  );
}
