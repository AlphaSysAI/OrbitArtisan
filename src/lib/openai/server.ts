import "server-only";

import OpenAI from "openai";

import { getRequiredEnv } from "@/lib/supabase/env";

let openai: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (!openai) {
    openai = new OpenAI({ apiKey: getRequiredEnv("OPENAI_API_KEY") });
  }
  return openai;
}

