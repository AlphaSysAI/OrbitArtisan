import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@stackforge-eu/factur-x",
    "libxml2-wasm",
    "saxon-js",
    "twilio",
  ],
  async headers() {
    return [
      {
        // Durcissement commun : pas de sniffing MIME (un fichier servi en
        // text/plain ne peut pas être interprété comme script/HTML), referer
        // tronqué vers l'extérieur (les liens /rdv/suivi/<token> ne fuitent pas).
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // Seule route destinée à être affichée dans une iframe tierce :
        // c'est le widget que l'artisan colle sur son propre site.
        source: "/embed/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors *; object-src 'none'; base-uri 'self'" },
        ],
      },
      {
        // Le loader doit rester joignable depuis n'importe quel domaine, mais
        // sans traîner en cache pendant des heures chez les visiteurs.
        source: "/embed.js",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cache-Control", value: "public, max-age=300, must-revalidate" },
        ],
      },
      {
        // Tout le reste (app, vitrines, tunnel public) refuse l'encadrement.
        source: "/((?!embed/).*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'; object-src 'none'; base-uri 'self'" },
          // Caméra/micro/géoloc réservés à nos pages (photos chantier, dictée,
          // localisation estimation) ; tout le reste coupé.
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(self), geolocation=(self), payment=(), usb=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
