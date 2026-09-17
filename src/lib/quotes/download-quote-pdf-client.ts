/** Télécharge le PDF devis côté navigateur avec gestion d'erreur (évite un .json sauvegardé comme PDF). */

export async function downloadQuotePdfClient(
  quoteId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const res = await fetch(`/api/quotes/${quoteId}/pdf`, { credentials: "include" });

  if (!res.ok) {
    let message = "Impossible de télécharger le PDF.";
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      if (body.error === "auth") {
        message = "Connecte-toi pour télécharger le devis.";
      } else if (body.error === "forbidden") {
        message = "Tu n'as pas accès à ce devis.";
      } else if (body.message) {
        message = body.message;
      } else if (body.error === "not_found") {
        message = "Devis introuvable.";
      } else if (body.error === "pdf_failed") {
        message = "Impossible de générer le PDF — complète ton profil dans Réglages > Mon activité.";
      }
    } catch {
      // ignore JSON parse errors
    }
    return { ok: false, message };
  }

  const contentType = res.headers.get("Content-Type") ?? "";
  if (!contentType.includes("pdf")) {
    return { ok: false, message: "Le serveur n'a pas renvoyé un PDF valide." };
  }

  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition");
  const filenameMatch = disposition?.match(/filename="([^"]+)"/);
  const filename = filenameMatch?.[1] ?? `devis-${quoteId.slice(0, 8)}.pdf`;

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);

  return { ok: true };
}
