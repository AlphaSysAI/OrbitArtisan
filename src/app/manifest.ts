import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Orbit Artisan",
    short_name: "Orbit",
    description:
      "Le SaaS tout‑en‑un pour artisans : devis, factures, planning, et site vitrine avec prise de RDV.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#171717",
    lang: "fr",
    dir: "ltr",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/pwa-icons/192",
        type: "image/png",
        sizes: "192x192",
        purpose: "any",
      },
      {
        src: "/pwa-icons/512",
        type: "image/png",
        sizes: "512x512",
        purpose: "any",
      },
      {
        src: "/pwa-icons/512-maskable",
        type: "image/png",
        sizes: "512x512",
        purpose: "maskable",
      },
    ],
  };
}
