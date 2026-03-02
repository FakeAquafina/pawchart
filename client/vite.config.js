import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // In dev mode, proxy /api calls to the local backend
      "/api": {
        target: "http://localhost:3456",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "../server/public",
    emptyOutDir: true,
  },
});
