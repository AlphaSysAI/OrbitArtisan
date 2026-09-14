import "server-only";

export type WebSearchHit = {
  title: string;
  url: string;
  snippet: string;
};

export type WebSearchResult = {
  query: string;
  answer: string | null;
  hits: WebSearchHit[];
};

/**
 * Recherche web optionnelle (Tavily) pour enrichir les métrés devis.
 * Sans `TAVILY_API_KEY`, retourne null — le métré repose alors sur le LLM seul.
 */
export async function searchWebForQuoteContext(query: string): Promise<WebSearchResult | null> {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) return null;

  const trimmed = query.trim();
  if (!trimmed) return null;

  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: trimmed,
        search_depth: "basic",
        max_results: 4,
        include_answer: true,
        topic: "general",
      }),
      signal: AbortSignal.timeout(12_000),
    });

    if (!res.ok) {
      console.warn("[web-search] Tavily HTTP", res.status);
      return null;
    }

    const json = (await res.json()) as {
      query?: string;
      answer?: string;
      results?: { title?: string; url?: string; content?: string }[];
    };

    const hits: WebSearchHit[] = (json.results ?? [])
      .map((r) => ({
        title: String(r.title ?? "").trim(),
        url: String(r.url ?? "").trim(),
        snippet: String(r.content ?? "").trim().slice(0, 600),
      }))
      .filter((h) => h.title && h.url && h.snippet);

    if (!hits.length && !json.answer?.trim()) return null;

    return {
      query: json.query ?? trimmed,
      answer: json.answer?.trim() || null,
      hits,
    };
  } catch (err) {
    console.warn("[web-search] Tavily error", err);
    return null;
  }
}

export function formatWebSearchForPrompt(result: WebSearchResult): string {
  const parts: string[] = [`Requête : ${result.query}`];
  if (result.answer) {
    parts.push(`Synthèse Tavily :\n${result.answer}`);
  }
  for (const hit of result.hits.slice(0, 4)) {
    parts.push(`- ${hit.title}\n  ${hit.url}\n  ${hit.snippet}`);
  }
  return parts.join("\n\n");
}
