/** Échappe une valeur utilisateur avant interpolation dans un e-mail HTML. */
export function escapeHtml(value: string | null | undefined): string {
  if (value == null) return "";
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
