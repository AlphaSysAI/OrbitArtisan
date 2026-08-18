import "server-only";

import { getAdminDb } from "@/lib/admin/db";

export type AdminAuditAction =
  | "tenant.update"
  | "tenant.suspend"
  | "tenant.reactivate"
  | "tenant.archive"
  | "tenant.restore"
  | "tenant.plan_change"
  | "tenant.reset_access"
  | "impersonation.start"
  | "impersonation.end";

export async function writeAdminAuditLog(input: {
  adminUserId: string;
  action: AdminAuditAction | string;
  targetUserId?: string | null;
  targetProfileId?: string | null;
  details?: Record<string, unknown> | null;
}) {
  try {
    const admin = getAdminDb();
    if (!admin) return;
    await admin.from("admin_audit_logs").insert({
      admin_user_id: input.adminUserId,
      target_user_id: input.targetUserId ?? null,
      target_profile_id: input.targetProfileId ?? null,
      action: input.action,
      details: input.details ?? null,
    });
  } catch {
    // Ne pas bloquer l'action admin si le journal échoue.
  }
}
