"use client";

import { Mail, MessageSquare, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getPublicSiteUrl } from "@/lib/site-url";

function buildVitrineShareContent(slug: string, businessName: string) {
  const url = `${getPublicSiteUrl()}/site/${slug}`;
  const subject = `Ma page vitrine — ${businessName}`;
  const body = `Bonjour,\n\nVoici ma page vitrine pour consulter mes prestations et prendre rendez-vous :\n\n${url}\n\n${businessName}`;

  return {
    url,
    mailto: `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
    sms: `sms:?body=${encodeURIComponent(body)}`,
  };
}

export function VitrineShareButton({
  slug,
  businessName,
}: {
  slug: string;
  businessName: string;
}) {
  const { mailto, sms } = buildVitrineShareContent(slug, businessName);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button type="button" variant="outline" size="lg" className="gap-2 shrink-0">
            <Share2 className="size-4" />
            Partager
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuItem render={<a href={mailto} />} className="gap-2">
          <Mail className="size-4" />
          Par e-mail
        </DropdownMenuItem>
        <DropdownMenuItem render={<a href={sms} />} className="gap-2">
          <MessageSquare className="size-4" />
          Par SMS
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
