import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    "__TURNSTILE_SITE_KEY__": JSON.stringify(loadEnv(mode, process.cwd(), "").TURNSTILE_SITE_KEY || loadEnv(mode, process.cwd(), "").VITE_TURNSTILE_SITE_KEY || "")
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
