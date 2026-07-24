import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

/*
 * Development-only build config for the UI-4 evidence harness. Like the UI Lab
 * config, it is intentionally separate from vite.config.ts so the production
 * application build never includes it. It serves public/ so the brand tokens
 * and app-shell.css resolve, and emits a static artifact to dist/ui-4-evidence/
 * (gitignored) used only to capture desktop/mobile screenshots.
 */
export default defineConfig({
  root: fileURLToPath(new URL("./src/ui/app/evidence", import.meta.url)),
  publicDir: fileURLToPath(new URL("./public", import.meta.url)),
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL("./dist/ui-4-evidence", import.meta.url)),
    emptyOutDir: true,
  },
  server: {
    port: 5198,
  },
});
