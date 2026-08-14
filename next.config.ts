import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@stafyniaksacha/facturx", "libxmljs", "saxon-js"],
  async headers() {
    return [
      {
        // Seule route destinée à être affichée dans une iframe tierce :
        // c'est le widget que l'artisan colle sur son propre site.
        source: "/embed/:path*",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }],
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
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
