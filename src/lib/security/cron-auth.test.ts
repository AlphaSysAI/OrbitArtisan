import { describe, expect, it } from "vitest";

import { isAuthorizedCronRequest } from "./cron-auth";

const req = (auth?: string) => new Request("https://x/api/cron/a", { headers: auth ? { authorization: auth } : {} });

describe("isAuthorizedCronRequest", () => {
  it("fermé sans secret configuré", () => {
    expect(isAuthorizedCronRequest(req("Bearer "), "")).toBe(false);
    expect(isAuthorizedCronRequest(req(), undefined)).toBe(false);
  });
  it("exige le bon secret", () => {
    expect(isAuthorizedCronRequest(req("Bearer s3cret"), "s3cret")).toBe(true);
    expect(isAuthorizedCronRequest(req("Bearer autre"), "s3cret")).toBe(false);
    expect(isAuthorizedCronRequest(req(), "s3cret")).toBe(false);
  });
});
