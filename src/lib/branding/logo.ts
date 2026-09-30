import { VITRINE_MEDIA_BUCKET } from "@/lib/vitrine/gallery";

/** Poids max accepté pour un logo (après recadrage/compression côté navigateur). */
export const LOGO_MAX_BYTES = 900 * 1024;
export const LOGO_MAX_SIDE_PX = 800;

export type LogoKind = "png" | "jpeg";

/** Détection par signature binaire (on ne fait jamais confiance au type MIME annoncé). */
export function detectLogoKind(bytes: Uint8Array): LogoKind | null {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  return null;
}

/** Chemin de stockage d'un logo : <profileId>/logo/<horodatage>.<ext> (bucket public vitrine-media). */
export function logoStoragePath(profileId: string, kind: LogoKind, now = Date.now()): string {
  return `${profileId}/logo/${now}.${kind === "png" ? "png" : "jpg"}`;
}

function storagePublicPrefix(env: NodeJS.ProcessEnv = process.env): string | null {
  const base = env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, "");
  return base ? `${base}/storage/v1/object/public/${VITRINE_MEDIA_BUCKET}/` : null;
}

/**
 * Chemin de stockage si l'URL désigne un logo Soline de CET artisan, sinon null.
 * Sert à supprimer l'ancien fichier et à borner les téléchargements (anti-SSRF).
 */
export function ownLogoStoragePath(
  url: string | null | undefined,
  profileId?: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const prefix = storagePublicPrefix(env);
  if (!prefix || !url?.startsWith(prefix)) return null;
  const path = decodeURIComponent(url.slice(prefix.length).split("?")[0]!);
  if (path.includes("..") || !/^[0-9a-f-]{36}\/logo\/[\w.-]+$/i.test(path)) return null;
  if (profileId && !path.startsWith(`${profileId}/`)) return null;
  return path;
}

/**
 * Récupère les octets du logo pour les PDF. Seules les URL de notre stockage
 * sont suivies : un ancien logo_url saisi à la main (URL arbitraire) n'est
 * jamais téléchargé par le serveur (SSRF). Timeout court, taille bornée.
 */
export async function loadLogoBytesForPdf(url: string | null | undefined): Promise<Uint8Array | null> {
  if (!ownLogoStoragePath(url)) return null;
  try {
    const res = await fetch(url!, { signal: AbortSignal.timeout(5000), cache: "force-cache" });
    if (!res.ok) return null;
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > LOGO_MAX_BYTES * 2) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > LOGO_MAX_BYTES * 2 || !detectLogoKind(bytes)) return null;
    return bytes;
  } catch {
    return null;
  }
}
