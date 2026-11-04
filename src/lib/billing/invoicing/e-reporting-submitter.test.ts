import { afterEach, expect, it, vi } from "vitest";
import { buildEReportingBatchPayload } from "./e-reporting";
import { createEReportingSubmitter } from "./e-reporting-submitter";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("exige un accusé explicite et distingue mise en file et transmission", async () => {
  vi.stubEnv("E_REPORTING_PROVIDER", "http");
  vi.stubEnv("E_REPORTING_API_URL", "https://provider.example.invalid");
  vi.stubEnv("E_REPORTING_API_KEY", "test");
  vi.stubGlobal("fetch", vi.fn()
    .mockResolvedValueOnce(new Response("{}"))
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: "ack-1", status: "queued" })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: "ack-1", status: "submitted" }))));
  const submitter = createEReportingSubmitter();
  const payload = buildEReportingBatchPayload("test-artisan", "2026-11-01", []);
  await expect(submitter.submitBatch(payload)).rejects.toThrow("e_reporting_unrecognized_ack");
  await expect(submitter.submitBatch(payload)).resolves.toMatchObject({ submissionId: "ack-1", status: "queued" });
  await expect(submitter.submitBatch(payload)).resolves.toMatchObject({ submissionId: "ack-1", status: "submitted" });
});
