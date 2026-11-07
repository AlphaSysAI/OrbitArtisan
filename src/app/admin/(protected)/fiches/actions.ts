"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { writeAdminAuditLog } from "@/lib/admin/audit-log";
import { getAdminDb } from "@/lib/admin/db";
import { requirePlatformAdminSafe } from "@/lib/auth/platform-admin";
import { getLibrarySheet } from "@/lib/technical-sheets/catalog";

async function guardAdmin() {
  const res = await requirePlatformAdminSafe();
  if (!res.ok) {
    if (res.error === "auth") redirect("/login?next=/admin/fiches");
    redirect("/admin/forbidden");
  }
  const admin = getAdminDb();
  if (!admin) throw new Error("ADMIN_MISSING_SERVICE_ROLE");
  return { user: res.user, admin };
}

export type ReviewActionResult = { ok: true } | { ok: false; error: string };

function clean(value: string | null | undefined, max: number): string | null {
  const text = String(value ?? "").trim().slice(0, max);
  return text || null;
}

/** Marque une fiche de la bibliothèque comme vérifiée ou à corriger (null = remettre en relecture). */
export async function setSheetReviewAction(input: {
  sheetId: string;
  status: "verified" | "needs_changes" | null;
  reviewerName?: string;
  note?: string;
}): Promise<ReviewActionResult> {
  const { user, admin } = await guardAdmin();
  if (!getLibrarySheet(input.sheetId)) return { ok: false, error: "Fiche inconnue." };

  if (input.status === null) {
    const { error } = await admin.from("technical_sheet_reviews").delete().eq("sheet_id", input.sheetId);
    if (error) return { ok: false, error: "Enregistrement impossible (migration 76 appliquée ?)." };
  } else {
    const reviewerName = clean(input.reviewerName, 120);
    if (input.status === "verified" && !reviewerName) {
      return { ok: false, error: "Indique qui a relu la fiche (nom et métier)." };
    }
    const { error } = await admin.from("technical_sheet_reviews").upsert({
      sheet_id: input.sheetId,
      status: input.status,
      reviewer_name: reviewerName,
      note: clean(input.note, 2000),
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    });
    if (error) return { ok: false, error: "Enregistrement impossible (migration 76 appliquée ?)." };
  }

  await writeAdminAuditLog({
    adminUserId: user.id,
    action: "technical_sheet.review",
    details: { sheetId: input.sheetId, status: input.status },
  });
  revalidatePath("/admin/fiches");
  revalidatePath("/app/fiches");
  return { ok: true };
}
