import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export type AdminSetupIssue = "missing_service_role" | "missing_migration";

export function getAdminDb(): SupabaseClient | null {
  return createSupabaseServiceRoleClient();
}

export function isMissingColumnError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  const msg = error.message?.toLowerCase() ?? "";
  return (
    msg.includes("does not exist") ||
    msg.includes("could not find") ||
    (msg.includes("column") && msg.includes("schema cache"))
  );
}

export function isMissingRelationError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const msg = error.message?.toLowerCase() ?? "";
  return msg.includes("relation") && msg.includes("does not exist");
}

export function emptyAdminMetrics() {
  return {
    artisansTotal: 0,
    artisansActive: 0,
    artisansSuspended: 0,
    quotesTotal: 0,
    invoicesTotal: 0,
    customersTotal: 0,
    estimatedMrrCents: 0,
  };
}
