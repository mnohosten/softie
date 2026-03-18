import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
  },
  server: {
    port: 3848,
    proxy: {
      "/api": {
        target: "http://localhost:3847",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:3847",
        ws: true,
      },
    },
  },
});
