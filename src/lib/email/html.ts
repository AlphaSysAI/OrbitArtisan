/** Échappe une valeur utilisateur avant interpolation dans un e-mail HTML. */
export function escapeHtml(value: string | null | undefined): string {
  if (value == null) return "";
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/** Bouton d'appel à l'action pour e-mail (URL et libellé échappés). */
export function emailButton(url: string, label: string, color = "#f97316"): string {
  return `<p style="margin:20px 0"><a href="${escapeHtml(url)}" style="display:inline-block;padding:13px 22px;background:${color};color:#fff;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(label)}</a></p>`;
}
