import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  publicDir: "public",
  server: {
    port: 5173,
    proxy: {
      "/documents": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: fileURLToPath(new URL("../backend/public/", import.meta.url)),
    emptyOutDir: true,
  },
});
