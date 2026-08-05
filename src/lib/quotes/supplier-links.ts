/**
 * Construction du message envoyé au client à l'émission d'un devis.
 * Les fournitures en achat direct y sont listées avec leur lien fournisseur,
 * afin que le client puisse les commander lui-même.
 */

export type DirectPurchaseItem = {
  label: string;
  quantity: number;
  supplierUrl: string | null;
  supplierSku: string | null;
};

/** Limite imposée par sendMessage() : au-delà, l'insertion est rejetée. */
export const MESSAGE_MAX_LENGTH = 8000;

/** N'accepte que http(s) : une URL collée à la main peut être vide ou d'un schéma inattendu. */
export function isSafeHttpUrl(raw: string | null | undefined): boolean {
  if (!raw) return false;
  try {
    const parsed = new URL(raw.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function formatItem(item: DirectPurchaseItem): string {
  const sku = item.supplierSku?.trim();
  const head = `• ${item.label} × ${item.quantity}${sku ? ` — réf. ${sku}` : ""}`;
  return isSafeHttpUrl(item.supplierUrl) ? `${head}\n  ${item.supplierUrl!.trim()}` : head;
}

export function buildQuoteNotificationMessage(opts: {
  totalFormatted: string;
  quoteUrl: string;
  directPurchaseItems: DirectPurchaseItem[];
  maxLength?: number;
}): string {
  const { totalFormatted, quoteUrl, directPurchaseItems } = opts;
  const maxLength = opts.maxLength ?? MESSAGE_MAX_LENGTH;

  const header = `📋 J’ai préparé un devis pour toi — Total : ${totalFormatted}. Consulte-le ici : ${quoteUrl}`;

  const items = directPurchaseItems.filter((i) => i.label.trim());
  if (items.length === 0) return header;

  const intro = `\n\n🛒 Fournitures à acheter directement (${items.length}) — non incluses dans ma facture :`;
  const omittedSuffix = (n: number) => `\n… et ${n} autre(s), détail dans le devis.`;

  // Si l'en-tête seul ne tient pas dans le budget, la section fournitures est abandonnée :
  // le total et le lien du devis priment sur la liste.
  if (header.length + intro.length + omittedSuffix(items.length).length > maxLength) {
    return header;
  }

  // Ajout ligne à ligne, en réservant toujours la place du suffixe d'omission.
  const lines: string[] = [];
  let used = header.length + intro.length;

  for (const [index, item] of items.entries()) {
    const line = `\n${formatItem(item)}`;
    const suffixIfWeStopHere = omittedSuffix(items.length - index).length;

    if (used + line.length + suffixIfWeStopHere > maxLength) {
      lines.push(omittedSuffix(items.length - index));
      break;
    }

    lines.push(line);
    used += line.length;
  }

  return `${header}${intro}${lines.join("")}`;
}
