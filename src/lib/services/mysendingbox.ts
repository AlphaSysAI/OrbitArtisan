import "server-only";

const MYSENDINGBOX_API_URL = "https://api.mysendingbox.fr";

/** Adresse postale au format MySendingBox. */
export type MySendingBoxAddress = {
  name: string;
  company?: string | null;
  address_line1: string;
  address_line2?: string | null;
  address_city: string;
  address_postalcode: string;
  address_country: string;
};

export type SendLetterSource =
  /** URL HTTPS publiquement joignable (ex. URL signée Supabase Storage). */
  | { kind: "remote"; url: string }
  /** Octets du PDF transmis en multipart. */
  | { kind: "file"; pdf: Uint8Array; filename: string };

export type SendLetterInput = {
  /** Expéditeur (l'artisan) — obligatoire pour `lr` et `lrar`. */
  from: MySendingBoxAddress;
  /** Destinataire (le débiteur). */
  to: MySendingBoxAddress;
  source: SendLetterSource;
  description?: string;
  /** `express` poste le jour même si requête avant 14h. */
  postageSpeed?: "express" | "D" | "D1";
  color?: "bw" | "color";
  bothSides?: boolean;
  /** Déclenche `letter.wrong_address` en cas de NPAI. */
  manageReturnedMail?: boolean;
  /** Rejoue sans doublon (24h de rétention côté MySendingBox). */
  idempotencyKey?: string;
};

/** Objet File MySendingBox (preuves, document envoyé). */
export type MySendingBoxFile = {
  _id: string;
  url: string;
  type: string;
  page_count?: number;
};

export type MySendingBoxLetter = {
  _id: string;
  status?: string;
  mode?: "test" | "live";
  postage_type?: string;
  tracking_number?: string | null;
  expected_sending_date?: string | null;
  first_presentation_date?: string | null;
  return_to_sender_reason?: string | null;
  wrong_address?: boolean;
  file?: MySendingBoxFile | null;
  filing_proof?: MySendingBoxFile | null;
  delivery_proof?: MySendingBoxFile | null;
  return_to_sender_proof?: MySendingBoxFile | null;
  lost_proof?: MySendingBoxFile | null;
  events?: { name: string; created_at: string; description?: string }[];
  price?: { total?: number } | null;
};

export type MySendingBoxResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

function authHeader(apiKey: string): string {
  // Basic Auth : la clé API sert d'identifiant, sans mot de passe.
  return `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;
}

function readApiKey(): string | null {
  return process.env.MYSENDINGBOX_API_KEY?.trim() || null;
}

export function isMySendingBoxConfigured(): boolean {
  return readApiKey() !== null;
}

function normalizeLetter(raw: Record<string, unknown>): MySendingBoxLetter {
  const asFile = (value: unknown): MySendingBoxFile | null => {
    if (!value || typeof value !== "object") return null;
    const file = value as Record<string, unknown>;
    if (typeof file.url !== "string") return null;
    return {
      _id: String(file._id ?? ""),
      url: file.url,
      type: String(file.type ?? ""),
      page_count: typeof file.page_count === "number" ? file.page_count : undefined,
    };
  };

  return {
    _id: String(raw._id ?? raw.id ?? ""),
    status: typeof raw.status === "string" ? raw.status : undefined,
    mode: raw.mode === "live" ? "live" : raw.mode === "test" ? "test" : undefined,
    postage_type: typeof raw.postage_type === "string" ? raw.postage_type : undefined,
    tracking_number: typeof raw.tracking_number === "string" ? raw.tracking_number : null,
    expected_sending_date:
      typeof raw.expected_sending_date === "string" ? raw.expected_sending_date : null,
    first_presentation_date:
      typeof raw.firstPresentationDate === "string" ? raw.firstPresentationDate : null,
    return_to_sender_reason:
      typeof raw.returnToSenderReason === "string" ? raw.returnToSenderReason : null,
    wrong_address: raw.wrong_address === true,
    file: asFile(raw.file),
    filing_proof: asFile(raw.filing_proof),
    delivery_proof: asFile(raw.delivery_proof),
    return_to_sender_proof: asFile(raw.return_to_sender_proof),
    lost_proof: asFile(raw.lost_proof),
    events: Array.isArray(raw.events)
      ? raw.events
          .filter((e): e is Record<string, unknown> => Boolean(e) && typeof e === "object")
          .map((e) => ({
            name: String(e.name ?? ""),
            created_at: String(e.created_at ?? ""),
            description: typeof e.description === "string" ? e.description : undefined,
          }))
      : undefined,
    price:
      raw.price && typeof raw.price === "object"
        ? { total: Number((raw.price as { total?: unknown }).total ?? 0) }
        : null,
  };
}

async function parseResponse(res: Response): Promise<{ raw: string; json: unknown }> {
  const raw = await res.text();
  try {
    return { raw, json: JSON.parse(raw) };
  } catch {
    return { raw, json: null };
  }
}

function extractErrorMessage(json: unknown, raw: string, status: number): string {
  if (json && typeof json === "object") {
    const body = json as Record<string, unknown>;
    const candidate = body.error ?? body.message ?? body.error_message;
    if (typeof candidate === "string" && candidate.trim()) {
      return `mysendingbox_${status}: ${candidate.trim()}`;
    }
  }
  return `mysendingbox_${status}: ${raw.slice(0, 300)}`;
}

function buildJsonBody(input: SendLetterInput, remoteUrl: string): Record<string, unknown> {
  return {
    description: input.description ?? "Mise en demeure",
    to: input.to,
    from: input.from,
    source_file: remoteUrl,
    source_file_type: "remote",
    postage_type: "lrar",
    postage_speed: input.postageSpeed ?? "D1",
    color: input.color ?? "bw",
    both_sides: input.bothSides ?? true,
    manage_returned_mail: input.manageReturnedMail ?? true,
  };
}

function buildMultipartBody(input: SendLetterInput, pdf: Uint8Array, filename: string): FormData {
  const form = new FormData();

  const appendAddress = (prefix: "to" | "from", address: MySendingBoxAddress) => {
    for (const [key, value] of Object.entries(address)) {
      if (value == null || value === "") continue;
      form.append(`${prefix}[${key}]`, String(value));
    }
  };

  appendAddress("to", input.to);
  appendAddress("from", input.from);

  form.append("description", input.description ?? "Mise en demeure");
  form.append("source_file_type", "file");
  form.append("postage_type", "lrar");
  form.append("postage_speed", input.postageSpeed ?? "D1");
  form.append("color", input.color ?? "bw");
  form.append("both_sides", String(input.bothSides ?? true));
  form.append("manage_returned_mail", String(input.manageReturnedMail ?? true));
  form.append(
    "source_file",
    new Blob([Buffer.from(pdf)], { type: "application/pdf" }),
    filename,
  );

  return form;
}

/**
 * Envoie une mise en demeure en Lettre Recommandée avec Accusé de Réception
 * (papier, imprimée et distribuée par La Poste).
 *
 * @see https://docs.mysendingbox.fr/ — `POST /letters`, `postage_type: lrar`
 */
export async function sendFormalNoticeLRAR(
  input: SendLetterInput,
): Promise<MySendingBoxResult<MySendingBoxLetter>> {
  const apiKey = readApiKey();
  if (!apiKey) return { ok: false, error: "mysendingbox_not_configured" };

  const headers: Record<string, string> = {
    Authorization: authHeader(apiKey),
    Accept: "application/json",
  };
  if (input.idempotencyKey) {
    headers["Idempotency-Key"] = input.idempotencyKey;
  }

  let body: BodyInit;
  if (input.source.kind === "remote") {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(buildJsonBody(input, input.source.url));
  } else {
    // FormData définit son propre Content-Type (avec boundary).
    body = buildMultipartBody(input, input.source.pdf, input.source.filename);
  }

  let res: Response;
  try {
    res = await fetch(`${MYSENDINGBOX_API_URL}/letters`, { method: "POST", headers, body });
  } catch (error) {
    return {
      ok: false,
      error: `mysendingbox_network: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const { raw, json } = await parseResponse(res);

  if (!res.ok) {
    return { ok: false, error: extractErrorMessage(json, raw, res.status), status: res.status };
  }

  if (!json || typeof json !== "object") {
    return { ok: false, error: "mysendingbox_invalid_response", status: res.status };
  }

  const letter = normalizeLetter(json as Record<string, unknown>);
  if (!letter._id) {
    return { ok: false, error: "mysendingbox_missing_letter_id", status: res.status };
  }

  return { ok: true, data: letter };
}

/** Récupère l'état courant d'une lettre (statut, suivi, preuves). */
export async function getLetterStatus(
  letterId: string,
): Promise<MySendingBoxResult<MySendingBoxLetter>> {
  const apiKey = readApiKey();
  if (!apiKey) return { ok: false, error: "mysendingbox_not_configured" };

  const trimmed = letterId.trim();
  if (!trimmed) return { ok: false, error: "mysendingbox_missing_letter_id" };

  let res: Response;
  try {
    res = await fetch(`${MYSENDINGBOX_API_URL}/letters/${encodeURIComponent(trimmed)}`, {
      method: "GET",
      headers: { Authorization: authHeader(apiKey), Accept: "application/json" },
      cache: "no-store",
    });
  } catch (error) {
    return {
      ok: false,
      error: `mysendingbox_network: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const { raw, json } = await parseResponse(res);

  if (!res.ok) {
    return { ok: false, error: extractErrorMessage(json, raw, res.status), status: res.status };
  }
  if (!json || typeof json !== "object") {
    return { ok: false, error: "mysendingbox_invalid_response", status: res.status };
  }

  return { ok: true, data: normalizeLetter(json as Record<string, unknown>) };
}

/** Télécharge une preuve (dépôt / distribution) depuis l'URL signée MySendingBox. */
export async function downloadLetterFile(url: string): Promise<MySendingBoxResult<Uint8Array>> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return { ok: false, error: `mysendingbox_file_${res.status}`, status: res.status };
    }
    const buffer = await res.arrayBuffer();
    return { ok: true, data: new Uint8Array(buffer) };
  } catch (error) {
    return {
      ok: false,
      error: `mysendingbox_file_network: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
