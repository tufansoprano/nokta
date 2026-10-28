import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { existsSync, readFileSync } from "node:fs";
import type { Plugin } from "vite";
import { configDefaults, defineConfig } from "vitest/config";

const devPort = Number(process.env.PORT ?? 5173);

/**
 * Inlines the homepage seed (scripts/generate-home-seed.ts) so the first venue cards
 * can render before the full list arrives. "<" is escaped so venue text can never
 * close the script tag.
 */
function homeSeed(): Plugin {
  return {
    name: "nokta-home-seed",
    apply: "build",
    transformIndexHtml(html) {
      const path = new URL("./.generated/home-seed.json", import.meta.url);
      const seed = existsSync(path) ? readFileSync(path, "utf8").trim() : "";
      if (!seed || seed === "[]") return html;
      const tag = `<script id="home-seed" type="application/json">${seed.replace(/</g, "\\u003c")}</script>`;
      return html.replace('<div id="root"></div>', `${tag}\n    <div id="root"></div>`);
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), homeSeed()],
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    // Integration tests hit the QA Supabase project; run them with npm run test:integration.
    exclude: [...configDefaults.exclude, "src/**/*.integration.test.ts"],
  },
  build: {
    // The map library stays in its lazy route chunk; warn if it grows past 1.1 MB.
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        // Match on the package directory, not a bare substring of the whole path:
        // a home directory or dependency path containing "react" would otherwise
        // land in vendor-react. MapLibre is deliberately left unnamed so it stays
        // inside the lazy chunks that use it, instead of being hoisted into the
        // entry's preload graph and making its stylesheet render-blocking on every page.
        manualChunks(id) {
          const match = id.match(/node_modules\/(?:\.pnpm\/)?((?:@[^/]+\/)?[^/]+)/);
          if (!match) return;
          const pkg = match[1];

          if (pkg === "react" || pkg === "react-dom" || pkg === "scheduler") return "vendor-react";
          if (pkg.startsWith("@supabase/")) return "vendor-supabase";
          if (pkg === "posthog-js") return "vendor-posthog";
          if (pkg.startsWith("@vercel/")) return "vendor-analytics";
          if (pkg.startsWith("@radix-ui/") || pkg === "lucide-react") return "vendor-ui";
          return;
        },
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: devPort,
    strictPort: true,
    hmr: {
      host: "127.0.0.1",
      clientPort: devPort,
    },
    watch: {
      usePolling: true,
      interval: 250,
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
});
