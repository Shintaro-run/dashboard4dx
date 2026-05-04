import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Streamlit custom components are loaded inside an iframe, so the bundle is
// served from a relative base. Building with `base: "./"` makes the emitted
// asset paths relative to index.html so it works whether Streamlit serves the
// component from `/component/...` or anywhere else.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
  server: {
    port: 5173,
  },
});
