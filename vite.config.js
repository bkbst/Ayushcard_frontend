import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "url";

const DEFAULT_API_PROXY_TARGET =
  "https://bkbsbackend-production.up.railway.app";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiProxyTarget =
    env.VITE_API_PROXY_TARGET ||
    env.VITE_API_BASE_URL ||
    DEFAULT_API_PROXY_TARGET;

  return {
    plugins: [react(), tailwindcss()],
    build: {
      target: "es2020",
      sourcemap: false,
      reportCompressedSize: false,
    },
    server: {
      proxy: {
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: true,
        },
      },
    },
  };
});
