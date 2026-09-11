import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildEReportingBatchPayload,
  groupEReportingQueueRows,
  type EReportingPayload,
} from "./e-reporting";
import { createEReportingSubmitter } from "./e-reporting-submitter";

export type RunEReportingResult = {
  processedGroups: number;
  submittedTransactions: number;
  failedTransactions: number;
  skippedNoop: boolean;
};

const BATCH_LIMIT = 200;

/**
 * Traite la file e-reporting : groupe par artisan/période, soumet à la PA, met à jour les statuts.
 */
export async function runEReportingSubmission(supabase: SupabaseClient): Promise<RunEReportingResult> {
  const submitter = createEReportingSubmitter();
  const provider = (process.env.E_REPORTING_PROVIDER ?? process.env.PA_PROVIDER ?? "noop").trim().toLowerCase();
  const hasApi =
    Boolean(process.env.E_REPORTING_API_URL?.trim()) &&
    Boolean(process.env.E_REPORTING_API_KEY?.trim() ?? process.env.PA_API_KEY?.trim());
  const isNoop = provider === "noop" || !hasApi;

  const { data: pendingRows, error: fetchError } = await supabase
    .from("e_reporting_queue")
    .select("id, artisan_id, reporting_period, payload, status")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (fetchError) {
    console.error("[e-reporting] fetch failed", fetchError.message);
    throw new Error(`e_reporting_fetch_failed: ${fetchError.message}`);
  }

  const rows = (pendingRows ?? []) as {
    id: string;
    artisan_id: string;
    reporting_period: string | null;
    payload: EReportingPayload;
  }[];

  if (!rows.length) {
    return { processedGroups: 0, submittedTransactions: 0, failedTransactions: 0, skippedNoop: isNoop };
  }

  const rowIds = rows.map((r) => r.id);
  await supabase.from("e_reporting_queue").update({ status: "batched" }).in("id", rowIds);

  const groups = groupEReportingQueueRows(rows);
  let submittedTransactions = 0;
  let failedTransactions = 0;

  for (const group of groups.values()) {
    const batch = buildEReportingBatchPayload(
      group.artisanId,
      group.period,
      group.rows.map((r) => r.payload),
    );

    const groupIds = group.rows.map((r) => r.id);

    try {
      const result = await submitter.submitBatch(batch);
      const now = new Date().toISOString();

      await supabase
        .from("e_reporting_queue")
        .update({
          status: "submitted",
          submitted_at: now,
          error_message: null,
        })
        .in("id", groupIds);

      console.info("[e-reporting] batch submitted", {
        artisanId: group.artisanId,
        period: group.period,
        count: group.rows.length,
        submissionId: result.submissionId,
        noop: isNoop,
      });

      submittedTransactions += group.rows.length;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[e-reporting] batch failed", {
        artisanId: group.artisanId,
        period: group.period,
        message,
      });

      await supabase
        .from("e_reporting_queue")
        .update({
          status: "failed",
          error_message: message.slice(0, 500),
        })
        .in("id", groupIds);

      failedTransactions += group.rows.length;
    }
  }

  return {
    processedGroups: groups.size,
    submittedTransactions,
    failedTransactions,
    skippedNoop: isNoop,
  };
}
