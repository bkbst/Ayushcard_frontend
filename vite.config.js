import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { fileURLToPath } from "url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [tailwindcss()],
  resolve: {
    alias: [
      {
        // Exact match only — do not rewrite `clipper-lib/clipper.js` subpaths.
        find: /^clipper-lib$/,
        replacement: path.resolve(rootDir, "src/shims/clipper-lib.js"),
      },
    ],
  },
  optimizeDeps: {
    include: [
      "clipper-lib/clipper.js",
      "js-yaml",
      "@paddleocr/paddleocr-js",
    ],
    needsInterop: ["clipper-lib/clipper.js"],
    exclude: ["@paddleocr/paddleocr-js/dist/assets/worker-entry-*.js"],
  },
  worker: {
    format: "es",
  },
  assetsInclude: ["**/*.wasm"],
  server: {
    proxy: {
      "/api": {
        target: "https://bkbs-backend.vercel.app",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
    commonjsOptions: {
      include: [/clipper-lib/, /node_modules/],
    },
  },
});
