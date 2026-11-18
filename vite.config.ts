import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig, loadEnv } from "vite";

/**
 * Enterprise Knowledge Platform — Web UI
 * Independent Vite app that talks to the Python RAG service.
 *
 * Dev proxy: /api → VITE_RAG_PROXY_TARGET (default http://127.0.0.1:8000)
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: ["react", "react/jsx-runtime", "react-dom", "react-dom/client"],
    },
    build: {
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            "react-vendor": ["react", "react-dom", "react-router"],
            "radix-ui": [
              "@radix-ui/react-accordion",
              "@radix-ui/react-alert-dialog",
              "@radix-ui/react-avatar",
              "@radix-ui/react-checkbox",
              "@radix-ui/react-dialog",
              "@radix-ui/react-dropdown-menu",
              "@radix-ui/react-label",
              "@radix-ui/react-popover",
              "@radix-ui/react-progress",
              "@radix-ui/react-scroll-area",
              "@radix-ui/react-select",
              "@radix-ui/react-separator",
              "@radix-ui/react-slider",
              "@radix-ui/react-switch",
              "@radix-ui/react-tabs",
              "@radix-ui/react-tooltip",
            ],
            "framer-motion": ["framer-motion"],
            charts: ["recharts"],
            forms: ["react-hook-form", "@hookform/resolvers", "zod"],
          },
          chunkFileNames: "assets/[name]-[hash].js",
          entryFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash].[ext]",
        },
      },
      chunkSizeWarningLimit: 1000,
      target: "esnext",
      minify: "esbuild",
    },
    optimizeDeps: {
      entries: ["index.html"],
      include: ["react", "react/jsx-runtime", "react-dom", "react-dom/client", "react-router", "framer-motion"],
    },
    server: {
      host: "0.0.0.0",
      port: Number(env.VITE_PORT || 3000),
      allowedHosts: true,
      hmr: false,
      ws: false,
    },
    preview: {
      host: "0.0.0.0",
      port: Number(env.VITE_PORT || 3000),
      allowedHosts: true,
    },
  };
});
