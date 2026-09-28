export const VITRINE_MEDIA_BUCKET = "vitrine-media";
export const VITRINE_GALLERY_MAX_IMAGES = 12;

export type VitrineGalleryImage = {
  id: string;
  storage_path: string;
  caption: string | null;
  sort_order: number;
  created_at: string;
};

export function vitrineMediaPublicUrl(storagePath: string): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, "");
  if (!base || !storagePath.trim()) return null;
  const encoded = storagePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${base}/storage/v1/object/public/${VITRINE_MEDIA_BUCKET}/${encoded}`;
}

export function isAllowedVitrineImageMime(mime: string): boolean {
  return ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mime);
}

export function extensionForVitrineMime(mime: string): string | null {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return null;
  }
}

/** Vérifie que le chemin appartient à l'artisan (anti-path traversal). */
export function vitrinePathBelongsToArtisan(storagePath: string, artisanId: string): boolean {
  const normalized = storagePath.trim().replace(/^\/+/, "");
  return normalized.startsWith(`${artisanId}/`) && !normalized.includes("..");
}
