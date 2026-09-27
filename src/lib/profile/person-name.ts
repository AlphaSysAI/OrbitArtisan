/** Prénom + nom de l'artisan → nom complet affiché (`profiles.name`). */
export function composeDisplayName(firstName: string | null | undefined, lastName: string | null | undefined): string {
  return [firstName, lastName]
    .map((part) => (part ?? "").trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .join(" ");
}

export function readPersonName(formData: FormData): { firstName: string; lastName: string; displayName: string } {
  const firstName = String(formData.get("first_name") ?? "").trim().replace(/\s+/g, " ");
  const lastName = String(formData.get("last_name") ?? "").trim().replace(/\s+/g, " ");
  return { firstName, lastName, displayName: composeDisplayName(firstName, lastName) };
}
