import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL("./preview", import.meta.url)),
  publicDir: fileURLToPath(new URL("./public", import.meta.url)),
  base: "/announcement-hub/",
  plugins: [react()],
  resolve: {
    alias: {
      "next/link": fileURLToPath(new URL("./preview/static-link.tsx", import.meta.url)),
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  build: {
    outDir: fileURLToPath(new URL("./pages-dist", import.meta.url)),
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL("./preview/index.html", import.meta.url)),
    },
  },
});
