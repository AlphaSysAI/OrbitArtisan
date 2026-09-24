import { describe, expect, it } from "vitest";

import {
  planIncludesSolineVoice,
  shouldAutoAssignVoiceNumber,
  shouldReleaseVoiceNumber,
  subscriptionStatusKeepsVoiceNumber,
} from "@/lib/voice/subscription-voice-number-sync";

describe("subscription voice number rules", () => {
  it("Pro/Premium incluent Soline, pas Base", () => {
    expect(planIncludesSolineVoice("pro")).toBe(true);
    expect(planIncludesSolineVoice("premium")).toBe(true);
    expect(planIncludesSolineVoice("base")).toBe(false);
    expect(planIncludesSolineVoice(null)).toBe(false);
  });

  it("conserve le numéro en actif, essai ou impayé", () => {
    expect(subscriptionStatusKeepsVoiceNumber("active")).toBe(true);
    expect(subscriptionStatusKeepsVoiceNumber("trialing")).toBe(true);
    expect(subscriptionStatusKeepsVoiceNumber("past_due")).toBe(true);
    expect(subscriptionStatusKeepsVoiceNumber("canceled")).toBe(false);
  });

  it("attribue auto uniquement Pro/Premium actifs", () => {
    expect(
      shouldAutoAssignVoiceNumber({ profileId: "p", planId: "pro", subscriptionStatus: "active" }),
    ).toBe(true);
    expect(
      shouldAutoAssignVoiceNumber({ profileId: "p", planId: "base", subscriptionStatus: "active" }),
    ).toBe(false);
    expect(
      shouldAutoAssignVoiceNumber({ profileId: "p", planId: "pro", subscriptionStatus: "canceled" }),
    ).toBe(false);
  });

  it("libère sur Base ou résiliation", () => {
    expect(
      shouldReleaseVoiceNumber({ profileId: "p", planId: "base", subscriptionStatus: "active" }),
    ).toBe(true);
    expect(
      shouldReleaseVoiceNumber({ profileId: "p", planId: "pro", subscriptionStatus: "canceled" }),
    ).toBe(true);
    expect(
      shouldReleaseVoiceNumber({ profileId: "p", planId: "pro", subscriptionStatus: "active" }),
    ).toBe(false);
  });
});
