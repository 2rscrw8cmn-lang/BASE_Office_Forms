import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

/*
 * Development-only build/serve config for the BASE UI Lab. It is intentionally
 * separate from vite.config.ts: the production application build never includes
 * the lab. `npm run lab` serves it; `npm run lab:build` emits a static artifact
 * to dist/ui-lab/ (gitignored), which is the shareable visual evidence.
 */
export default defineConfig({
  root: fileURLToPath(new URL("./src/ui/lab", import.meta.url)),
  // Serve public/ so the neutral brand tokens resolve at /brand-tokens.css.
  publicDir: fileURLToPath(new URL("./public", import.meta.url)),
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL("./dist/ui-lab", import.meta.url)),
    emptyOutDir: true,
  },
  server: {
    port: 5199,
  },
});
