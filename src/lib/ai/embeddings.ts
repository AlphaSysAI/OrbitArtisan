import "server-only";

import { mistralEmbed } from "@/lib/ai/mistral";

export async function embedText(text: string): Promise<number[]> {
  return mistralEmbed(text);
}

export function buildMaterialSearchQuery(name: string, specifications: string | null): string {
  const parts = [name.trim()];
  if (specifications?.trim()) parts.push(specifications.trim());
  return parts.join(" — ");
}
