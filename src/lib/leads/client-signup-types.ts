export type LeadSignupOffer = {
  canSignup: boolean;
  email: string | null;
  name: string | null;
  inviteToken: string | null;
  claimOnly: boolean;
};
