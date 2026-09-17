import { afterEach, describe, expect, it, vi } from "vitest";

import { createPayloadSubmitter, resolvePayloadSubmitterProvider } from "./create-invoice-service";
import { HttpPayloadSubmitter } from "./adapters/http-payload-submitter";
import { NoopPayloadSubmitter } from "./adapters/noop-payload-submitter";
import { PennylanePayloadSubmitter } from "./adapters/pennylane-payload-submitter";
import { RetryPayloadSubmitter } from "./adapters/retry-payload-submitter";

describe("resolvePayloadSubmitterProvider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("retombe sur noop si PA_PROVIDER absent ou inconnu", () => {
    vi.stubEnv("PA_PROVIDER", "");
    expect(resolvePayloadSubmitterProvider()).toBe("noop");

    vi.stubEnv("PA_PROVIDER", "un-fournisseur-inconnu");
    expect(resolvePayloadSubmitterProvider()).toBe("noop");
  });

  it("reconnaît superpdp comme les autres alias http", () => {
    vi.stubEnv("PA_PROVIDER", "superpdp");
    expect(resolvePayloadSubmitterProvider()).toBe("superpdp");
  });
});

describe("createPayloadSubmitter", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("superpdp sans PA_API_URL/PA_API_KEY retombe sur noop (pas d'appel réseau silencieux)", () => {
    vi.stubEnv("PA_API_URL", "");
    vi.stubEnv("PA_API_KEY", "");
    const submitter = createPayloadSubmitter("superpdp");
    expect(submitter).toBeInstanceOf(NoopPayloadSubmitter);
  });

  it("superpdp avec PA_API_URL/PA_API_KEY utilise l'adapter HTTP générique (avec retry)", () => {
    vi.stubEnv("PA_API_URL", "https://api.superpdp.tech/v1/invoices");
    vi.stubEnv("PA_API_KEY", "test-key");
    vi.stubEnv("PA_RETRY_ATTEMPTS", "3");
    const submitter = createPayloadSubmitter("superpdp");
    // Enveloppé par le retry wrapper tant que PA_RETRY_ATTEMPTS > 1 ; le générique HTTP est
    // interne (`private`), donc on vérifie juste que ce n'est ni noop ni un adapter dédié.
    expect(submitter).toBeInstanceOf(RetryPayloadSubmitter);
    expect(submitter).not.toBeInstanceOf(NoopPayloadSubmitter);
    expect(submitter).not.toBeInstanceOf(PennylanePayloadSubmitter);
  });

  it("docaposte avec PA_API_URL/PA_API_KEY se comporte comme superpdp (même alias http)", () => {
    vi.stubEnv("PA_API_URL", "https://api.docaposte.example/invoices");
    vi.stubEnv("PA_API_KEY", "test-key");
    vi.stubEnv("PA_RETRY_ATTEMPTS", "0");
    const submitter = createPayloadSubmitter("docaposte");
    expect(submitter).toBeInstanceOf(HttpPayloadSubmitter);
  });

  it("pennylane avec PA_API_KEY utilise l'adapter dédié", () => {
    vi.stubEnv("PA_API_KEY", "test-key");
    vi.stubEnv("PA_RETRY_ATTEMPTS", "0");
    const submitter = createPayloadSubmitter("pennylane");
    expect(submitter).toBeInstanceOf(PennylanePayloadSubmitter);
  });

  it("noop explicite ne fait jamais d'appel réseau", () => {
    const submitter = createPayloadSubmitter("noop");
    expect(submitter).toBeInstanceOf(NoopPayloadSubmitter);
  });
});
