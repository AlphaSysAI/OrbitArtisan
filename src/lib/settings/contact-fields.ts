export type ContactFields = {
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;
};

export function parseContactFieldsFromForm(formData: FormData): ContactFields {
  const trim = (key: string) => {
    const v = String(formData.get(key) ?? "").trim();
    return v || null;
  };

  return {
    phone: trim("phone"),
    address_line1: trim("address_line1"),
    address_line2: trim("address_line2"),
    postal_code: trim("postal_code"),
    city: trim("city"),
  };
}

export function normalizePhone(input: string | null): string | null {
  if (!input) return null;
  const cleaned = input.replace(/[^\d+]/g, "");
  if (cleaned.length < 6) return null;
  return input.trim();
}

export function normalizePostalCode(input: string | null): string | null {
  if (!input) return null;
  const digits = input.replace(/\s/g, "");
  if (!/^\d{5}$/.test(digits)) return null;
  return digits;
}
