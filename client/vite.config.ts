import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Bundle the shared package's TS source directly (real ESM) instead of its
      // CommonJS dist/ output — Rollup doesn't apply CJS interop to workspace-linked
      // packages the way it does for ordinary node_modules deps.
      "@korok/shared": fileURLToPath(new URL("../shared/src/index.ts", import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 5173,
  },
});
