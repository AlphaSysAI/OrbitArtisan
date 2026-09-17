"use client";

import * as React from "react";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { downloadQuotePdfClient } from "@/lib/quotes/download-quote-pdf-client";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

type DownloadQuotePdfButtonProps = {
  quoteId: string;
  label?: string;
  variant?: "default" | "outline" | "link";
  className?: string;
  fullWidth?: boolean;
};

export function DownloadQuotePdfButton({
  quoteId,
  label = "Télécharger le PDF",
  variant = "default",
  className,
  fullWidth = false,
}: DownloadQuotePdfButtonProps) {
  const [pending, setPending] = React.useState(false);

  async function handleClick() {
    setPending(true);
    const res = await downloadQuotePdfClient(quoteId);
    setPending(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    toast.success("PDF téléchargé.");
  }

  const classes = cn(
    variant === "link"
      ? "inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline"
      : buttonVariants({ variant, className: cn("inline-flex items-center justify-center gap-2", fullWidth && "w-full", className) }),
  );

  if (variant === "link") {
    return (
      <button type="button" className={classes} disabled={pending} onClick={() => void handleClick()}>
        {pending ? "Téléchargement…" : label}
      </button>
    );
  }

  return (
    <Button type="button" variant={variant} className={cn(fullWidth && "w-full", className)} disabled={pending} onClick={() => void handleClick()}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
      {pending ? "Téléchargement…" : label}
    </Button>
  );
}
