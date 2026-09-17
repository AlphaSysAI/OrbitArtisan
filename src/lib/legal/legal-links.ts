export const LEGAL_PAGE_LINKS = [
  { href: "/cgu", label: "CGU" },
  { href: "/cgv", label: "CGV" },
  { href: "/mentions-legales", label: "Mentions légales" },
  { href: "/confidentialite", label: "Confidentialité" },
] as const;

export type LegalPagePath = (typeof LEGAL_PAGE_LINKS)[number]["href"];
