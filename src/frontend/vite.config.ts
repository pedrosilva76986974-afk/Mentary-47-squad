import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  publicDir: "public",
  server: {
    port: 5173,
    proxy: {
      "/questions": { target: "http://localhost:3000", changeOrigin: true },
      "/documents": {
        target: "http://localhost:3000",
        changeOrigin: true,
        configure(proxy) {
          proxy.on("proxyReq", (upstream, _request, response) => {
            // A browser abort must also close the API connection so OCR can stop.
            const cancel = () => {
              if (!response.writableEnded) upstream.destroy();
            };
            response.once("close", cancel);
            upstream.once("close", () => response.off("close", cancel));
          });
        },
      },
    },
  },
  build: {
    outDir: fileURLToPath(new URL("../backend/public/", import.meta.url)),
    emptyOutDir: true,
  },
});
