"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { aiErrorMessage } from "@/lib/ai/error-messages";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function QuoteSummary({ quoteId }: { quoteId: string }) {
  const [loading, setLoading] = React.useState(false);
  const [summary, setSummary] = React.useState<string | null>(null);

  async function onGenerate() {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/summarize-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(aiErrorMessage(json?.error));
        return;
      }
      if (!json?.summary) {
        toast.error("Réponse IA vide");
        return;
      }
      setSummary(String(json.summary));
      toast.success("Résumé généré.");
    } catch {
      toast.error("Impossible de générer le résumé par IA.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-0 shadow-none">
      <CardHeader>
        <CardTitle className="text-xl">Résumé IA</CardTitle>
        <CardDescription>Aide à comprendre le devis et la discussion associée.</CardDescription>
      </CardHeader>
      <CardContent>
        {summary ? (
          <pre className="whitespace-pre-wrap text-sm text-muted-foreground">{summary}</pre>
        ) : (
          <div className="flex items-center gap-3">
            <Button type="button" onClick={onGenerate} disabled={loading} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Générer le résumé
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

