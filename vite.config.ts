import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  
  // CRITICAL FIX: This makes paths relative (./assets) instead of absolute (/assets).
  // Without this, Electron looks for files at C:/ and fails.
  base: "./",
  
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  
  // Explicitly define environment variables for compatibility
  define: {
    'import.meta.env.VITE_CONVEX_URL': JSON.stringify(process.env.VITE_CONVEX_URL || ''),
  },
  
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
    target: 'esnext',
    minify: 'esbuild',
    rollupOptions: {
      output: {
        // Ensures clean file output for Electron
        manualChunks: undefined,
      },
    },
  },
  
  server: {
    hmr: true,
  },
});
