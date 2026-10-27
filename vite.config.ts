import { defineConfig } from "vite";
import { resolve } from "node:path";

// Two pages: the island itself and the settings window.
export default defineConfig({
  clearScreen: false,
  server: { port: 1960, strictPort: true },
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        island: resolve(__dirname, "index.html"),
        settings: resolve(__dirname, "settings.html"),
      },
    },
  },
});
