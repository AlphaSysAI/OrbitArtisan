import { describe, expect, it, vi, afterEach } from "vitest";

import { PennylanePayloadSubmitter } from "./pennylane-payload-submitter";

describe("PennylanePayloadSubmitter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("envoie le PDF Factur-X dans le champ file", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({ id: "pl-123", status: "accepted" }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const submitter = new PennylanePayloadSubmitter("test-token", "https://pa.test/import");
    const result = await submitter.submitEInvoice({
      invoiceId: "inv-1",
      invoiceNumber: "FAC-001",
      facturXPdf: new Uint8Array([1, 2, 3]),
      facturXXml: "<xml/>",
      seller: { name: "Artisan", siren: "111111111", siret: null, vatNumber: "FR11111111111" },
      buyer: { name: "Client", siren: "222222222", siret: null, vatNumber: "FR22222222222" },
    });

    expect(result.submissionId).toBe("pl-123");
    expect(result.status).toBe("accepted");
    expect(fetchMock).toHaveBeenCalledOnce();

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
    expect(init.body).toBeInstanceOf(FormData);
  });
});
