"use client";

import type { AiQuoteDraft } from "@/lib/ai/quote-draft-storage";
import { saveAiQuoteDraft } from "@/lib/ai/quote-draft-storage";

export { mapApiResponseToDraft } from "@/lib/ai/map-quote-draft-core";

export function persistAiQuoteDraft(draft: AiQuoteDraft): void {
  saveAiQuoteDraft(draft);
}
