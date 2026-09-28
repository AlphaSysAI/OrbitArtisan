import { describe, expect, it } from "vitest";

import { verifyVoiceToolSecret } from "./voice-secret";

describe("verifyVoiceToolSecret", () => {
  it("accepte le secret avec ou sans Bearer", () => {
    expect(verifyVoiceToolSecret("Bearer abc123", "abc123").ok).toBe(true);
    expect(verifyVoiceToolSecret("abc123", "abc123").ok).toBe(true);
  });

  it("tolère guillemets, « Bearer: » et espaces parasites des deux côtés", () => {
    expect(verifyVoiceToolSecret(' "Bearer: abc123" ', "abc123\n").ok).toBe(true);
  });

  it("refuse un mauvais secret ou un secret non configuré", () => {
    expect(verifyVoiceToolSecret("Bearer abc124", "abc123").ok).toBe(false);
    expect(verifyVoiceToolSecret("Bearer ", "").ok).toBe(false);
  });
});
