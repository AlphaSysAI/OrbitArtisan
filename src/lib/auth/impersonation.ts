export const ADMIN_IMPERSONATION_COOKIE = "soline_admin_impersonate";
export const ADMIN_RETURN_SESSION_COOKIE = "soline_admin_return_session";

export type ImpersonationCookie = {
  targetUserId: string;
  targetProfileId: string;
  targetLabel: string;
  readOnly: boolean;
};

export type AdminReturnSessionCookie = {
  adminUserId: string;
  accessToken: string;
  refreshToken: string;
};
