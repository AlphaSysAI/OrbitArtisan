"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function QuotePublicLinkCard({ publicUrl, viewedAt }: { publicUrl: string; viewedAt: string | null }) {
  const [copied, setCopied] = React.useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      toast.success("Lien copié.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Impossible de copier le lien.");
    }
  }

  return (
    <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
      <p className="text-sm font-medium">Lien public client</p>
      <p className="text-xs text-muted-foreground">
        Partage ce lien sans que le client ait besoin de se connecter.
        {viewedAt ? ` Consulté le ${new Date(viewedAt).toLocaleString("fr-FR")}.` : " Pas encore consulté."}
      </p>
      <div className="flex gap-2">
        <Input readOnly value={publicUrl} className="font-mono text-xs" />
        <Button type="button" variant="outline" onClick={() => void copyLink()}>
          {copied ? "Copié" : "Copier"}
        </Button>
      </div>
    </div>
  );
}
