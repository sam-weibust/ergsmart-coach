import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "script",
      filename: "sw.js",
      strategies: "injectManifest",
      srcDir: "public",
      manifest: false,
      injectManifest: {
        swSrc: "public/sw.js",
        swDest: "dist/sw.js",
        globDirectory: "dist",
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        navigateFallback: "/index.html",
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/")) return "react-vendor";
          if (id.includes("node_modules/recharts/")) return "recharts";
          if (id.includes("node_modules/@supabase/")) return "supabase";
          if (id.includes("node_modules/@tanstack/")) return "query";
          if (id.includes("node_modules/date-fns/")) return "date";
          if (id.includes("node_modules/react-router")) return "router";
          if (id.includes("node_modules/@radix-ui/")) return "ui";
        },
      },
    },
  },
}));
