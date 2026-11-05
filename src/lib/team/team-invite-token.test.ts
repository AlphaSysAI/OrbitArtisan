import { describe, expect, it } from "vitest";

import { hashTeamInviteToken, isTeamInviteTokenFormat, newTeamInviteToken } from "./team-invite-token";

describe("jeton d'invitation d'équipe", () => {
  it("génère un jeton au bon format et une empreinte stable", () => {
    const token = newTeamInviteToken();
    expect(isTeamInviteTokenFormat(token)).toBe(true);
    expect(hashTeamInviteToken(token)).toBe(hashTeamInviteToken(token));
    expect(hashTeamInviteToken(token)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuse un jeton mal formé", () => {
    expect(isTeamInviteTokenFormat("abc")).toBe(false);
    expect(isTeamInviteTokenFormat("../../etc/passwd")).toBe(false);
  });
});
