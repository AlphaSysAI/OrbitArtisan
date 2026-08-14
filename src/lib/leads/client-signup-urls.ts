import type { LeadSignupOffer } from "@/lib/leads/client-signup-types";

export function buildLeadSignupHref(input: {
  leadToken: string;
  signup: LeadSignupOffer;
}): string {
  const params = new URLSearchParams();
  params.set("lead", input.leadToken);
  params.set("next", "/compte/messages");
  if (input.signup.email) params.set("email", input.signup.email);
  if (input.signup.name) params.set("name", input.signup.name);
  if (input.signup.inviteToken) params.set("invite", input.signup.inviteToken);
  return `/inscription-client?${params.toString()}`;
}

export function buildLeadLoginHref(leadToken: string): string {
  const next = `/compte/messages?claimLead=${encodeURIComponent(leadToken)}`;
  return `/login?next=${encodeURIComponent(next)}`;
}

export function buildLeadSuiviHref(leadToken: string): string {
  return `/estimation/suivi?token=${encodeURIComponent(leadToken)}`;
}
