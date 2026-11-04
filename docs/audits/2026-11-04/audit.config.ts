import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  resolve: { alias: { "@": path.resolve("src"), "server-only": path.resolve("test/server-only-stub.ts") } },
  test: { environment: "node", include: ["docs/audits/2026-11-04/audit.test.ts"] },
});
