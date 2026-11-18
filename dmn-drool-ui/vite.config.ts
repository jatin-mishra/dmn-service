import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// The backend has no CORS config, so in dev the browser calls /api on the Vite
// server and Vite forwards it to the backend (same-origin for the browser).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: env.BACKEND_URL || "http://localhost:9090",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
      },
    },
    // The classic editor is a ~29 MB prebuilt UMD bundle; it is fine as one chunk.
    build: { chunkSizeWarningLimit: 40000 },
  };
});
