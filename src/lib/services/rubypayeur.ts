import "server-only";

/**
 * Client RubyPayeur — transmission d'un dossier de créance avec mandat de
 * recouvrement amiable/judiciaire (modèle « no cure, no pay »).
 *
 * L'URL de base est pilotée par `RUBYPAYEUR_API_URL` : le contrat exact des
 * endpoints est fourni par RubyPayeur à l'ouverture du compte apporteur
 * d'affaires. Le mapping est isolé ici pour n'avoir qu'un seul fichier à
 * ajuster si leur schéma diffère.
 */

export type DebtorType = "company" | "individual";

export type RubypayeurDebtor = {
  type: DebtorType;
  name: string;
  /** Obligatoire en B2B (`type: "company"`). */
  siren?: string | null;
  vatNumber?: string | null;
  email?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  postalCode?: string | null;
  city?: string | null;
  countryCode?: string;
};

export type RubypayeurCreditor = {
  name: string;
  siren?: string | null;
  siret?: string | null;
  vatNumber?: string | null;
  email?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  postalCode?: string | null;
  city?: string | null;
  countryCode?: string;
};

export type RubypayeurDocumentKind =
  | "invoice"
  | "signed_quote"
  | "formal_notice"
  | "filing_proof"
  | "delivery_proof";

export type RubypayeurDocument = {
  kind: RubypayeurDocumentKind;
  filename: string;
  /** URL signée temporaire téléchargeable par RubyPayeur. */
  url: string;
};

export type RubypayeurCaseInput = {
  /** Référence interne (id facture) pour réconcilier les webhooks. */
  externalReference: string;
  invoiceNumber: string;
  invoiceIssueDate: string;
  invoiceDueDate?: string | null;
  /** Montant TTC dû, en euros (2 décimales). */
  amountDue: number;
  currency?: "EUR";
  creditor: RubypayeurCreditor;
  debtor: RubypayeurDebtor;
  documents: RubypayeurDocument[];
  /** Date d'acceptation du mandat par l'artisan (traçabilité légale). */
  mandateAcceptedAt: string;
  /** Identifiant partenaire pour la rétrocession apporteur d'affaires. */
  partnerReference?: string | null;
  formalNoticeSentAt?: string | null;
  notes?: string | null;
};

export type RubypayeurCase = {
  caseId: string;
  status: RubypayeurCaseStatus;
  rawResponse?: unknown;
};

export type RubypayeurCaseStatus =
  | "submitted"
  | "accepted"
  | "in_progress"
  | "partially_collected"
  | "collected"
  | "failed"
  | "canceled";

export type RubypayeurResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

const CASE_STATUSES: readonly RubypayeurCaseStatus[] = [
  "submitted",
  "accepted",
  "in_progress",
  "partially_collected",
  "collected",
  "failed",
  "canceled",
];

export function normalizeRubypayeurStatus(value: unknown): RubypayeurCaseStatus {
  const raw = String(value ?? "").trim().toLowerCase();
  if ((CASE_STATUSES as readonly string[]).includes(raw)) {
    return raw as RubypayeurCaseStatus;
  }
  switch (raw) {
    case "created":
    case "pending":
    case "received":
      return "submitted";
    case "open":
    case "ongoing":
    case "recovery_in_progress":
      return "in_progress";
    case "paid":
    case "recovered":
      return "collected";
    case "partial":
    case "partially_paid":
      return "partially_collected";
    case "rejected":
    case "unrecoverable":
    case "closed_failed":
      return "failed";
    case "cancelled":
      return "canceled";
    default:
      return "submitted";
  }
}

function readConfig(): { apiUrl: string; apiKey: string } | null {
  const apiUrl = process.env.RUBYPAYEUR_API_URL?.trim().replace(/\/$/, "");
  const apiKey = process.env.RUBYPAYEUR_API_KEY?.trim();
  if (!apiUrl || !apiKey) return null;
  return { apiUrl, apiKey };
}

export function isRubypayeurConfigured(): boolean {
  return readConfig() !== null;
}

function buildCasePayload(input: RubypayeurCaseInput): Record<string, unknown> {
  return {
    external_reference: input.externalReference,
    partner_reference: input.partnerReference ?? process.env.RUBYPAYEUR_PARTNER_ID?.trim() ?? null,
    mandate: {
      accepted: true,
      accepted_at: input.mandateAcceptedAt,
      scope: "amicable_and_judicial",
    },
    claim: {
      invoice_number: input.invoiceNumber,
      issue_date: input.invoiceIssueDate,
      due_date: input.invoiceDueDate ?? null,
      amount_due: Number(input.amountDue.toFixed(2)),
      currency: input.currency ?? "EUR",
      formal_notice_sent_at: input.formalNoticeSentAt ?? null,
      notes: input.notes ?? null,
    },
    creditor: {
      name: input.creditor.name,
      siren: input.creditor.siren ?? null,
      siret: input.creditor.siret ?? null,
      vat_number: input.creditor.vatNumber ?? null,
      email: input.creditor.email ?? null,
      phone: input.creditor.phone ?? null,
      address: {
        line1: input.creditor.addressLine1 ?? null,
        postal_code: input.creditor.postalCode ?? null,
        city: input.creditor.city ?? null,
        country: input.creditor.countryCode ?? "FR",
      },
    },
    debtor: {
      type: input.debtor.type,
      name: input.debtor.name,
      siren: input.debtor.siren ?? null,
      vat_number: input.debtor.vatNumber ?? null,
      email: input.debtor.email ?? null,
      phone: input.debtor.phone ?? null,
      address: {
        line1: input.debtor.addressLine1 ?? null,
        line2: input.debtor.addressLine2 ?? null,
        postal_code: input.debtor.postalCode ?? null,
        city: input.debtor.city ?? null,
        country: input.debtor.countryCode ?? "FR",
      },
    },
    documents: input.documents.map((doc) => ({
      kind: doc.kind,
      filename: doc.filename,
      url: doc.url,
    })),
  };
}

function validateCaseInput(input: RubypayeurCaseInput): string | null {
  if (!input.externalReference.trim()) return "missing_external_reference";
  if (!Number.isFinite(input.amountDue) || input.amountDue <= 0) return "invalid_amount";
  if (!input.debtor.name.trim()) return "missing_debtor_name";
  if (input.debtor.type === "company" && !input.debtor.siren?.trim()) {
    return "missing_debtor_siren";
  }
  if (input.debtor.type === "individual") {
    const hasPostalAddress =
      Boolean(input.debtor.addressLine1?.trim()) && Boolean(input.debtor.postalCode?.trim());
    if (!hasPostalAddress) return "missing_debtor_address";
  }
  if (input.documents.length === 0) return "missing_documents";
  if (!input.documents.some((doc) => doc.kind === "invoice")) return "missing_invoice_document";
  return null;
}

/** Transmet un dossier de créance à RubyPayeur et retourne l'identifiant du dossier. */
export async function createRecoveryCase(
  input: RubypayeurCaseInput,
): Promise<RubypayeurResult<RubypayeurCase>> {
  const config = readConfig();
  if (!config) return { ok: false, error: "rubypayeur_not_configured" };

  const validationError = validateCaseInput(input);
  if (validationError) return { ok: false, error: validationError };

  let res: Response;
  try {
    res = await fetch(`${config.apiUrl}/recovery-cases`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(buildCasePayload(input)),
    });
  } catch (error) {
    return {
      ok: false,
      error: `rubypayeur_network: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const rawText = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(rawText);
  } catch {
    /* réponse non JSON */
  }

  if (!res.ok) {
    const message =
      json && typeof json === "object"
        ? String(
            (json as Record<string, unknown>).error ??
              (json as Record<string, unknown>).message ??
              rawText.slice(0, 300),
          )
        : rawText.slice(0, 300);
    return { ok: false, error: `rubypayeur_${res.status}: ${message}`, status: res.status };
  }

  if (!json || typeof json !== "object") {
    return { ok: false, error: "rubypayeur_invalid_response", status: res.status };
  }

  const body = json as Record<string, unknown>;
  const caseId = body.case_id ?? body.id ?? body.caseId;
  if (caseId == null || String(caseId).trim() === "") {
    return { ok: false, error: "rubypayeur_missing_case_id", status: res.status };
  }

  return {
    ok: true,
    data: {
      caseId: String(caseId),
      status: normalizeRubypayeurStatus(body.status),
      rawResponse: json,
    },
  };
}

/** Consulte l'état d'un dossier (réconciliation / rattrapage de webhook manqué). */
export async function getRecoveryCase(
  caseId: string,
): Promise<RubypayeurResult<RubypayeurCase>> {
  const config = readConfig();
  if (!config) return { ok: false, error: "rubypayeur_not_configured" };

  const trimmed = caseId.trim();
  if (!trimmed) return { ok: false, error: "rubypayeur_missing_case_id" };

  try {
    const res = await fetch(`${config.apiUrl}/recovery-cases/${encodeURIComponent(trimmed)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${config.apiKey}`, Accept: "application/json" },
      cache: "no-store",
    });

    const rawText = await res.text();
    if (!res.ok) {
      return { ok: false, error: `rubypayeur_${res.status}: ${rawText.slice(0, 300)}`, status: res.status };
    }

    const json = JSON.parse(rawText) as Record<string, unknown>;
    const resolvedId = json.case_id ?? json.id ?? trimmed;

    return {
      ok: true,
      data: {
        caseId: String(resolvedId),
        status: normalizeRubypayeurStatus(json.status),
        rawResponse: json,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: `rubypayeur_network: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Rétrocession apporteur d'affaires sur les honoraires RubyPayeur.
 * Taux par défaut 20 %, surchargeable via `RUBYPAYEUR_COMMISSION_RATE`.
 */
export function computeOurCommission(rubypayeurFee: number): number {
  const parsed = Number(process.env.RUBYPAYEUR_COMMISSION_RATE ?? "0.2");
  const rate = Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 0.2;
  if (!Number.isFinite(rubypayeurFee) || rubypayeurFee <= 0) return 0;
  return Number((rubypayeurFee * rate).toFixed(2));
}
