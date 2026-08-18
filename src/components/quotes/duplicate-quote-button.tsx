"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { duplicateQuote } from "@/app/app/invoices/btp-actions";
import { Button } from "@/components/ui/button";

export function DuplicateQuoteButton({ quoteId }: { quoteId: string }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function handleClick() {
    setPending(true);
    const res = await duplicateQuote(quoteId);
    setPending(false);
    if (!res.ok) {
      toast.error("Impossible de dupliquer le devis.");
      return;
    }
    toast.success("Devis dupliqué.");
    router.push(`/app/quotes/${res.newQuoteId}`);
  }

  return (
    <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => void handleClick()}>
      {pending ? "…" : "Dupliquer"}
    </Button>
  );
}
