import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    // Enable HMR for faster development
    hmr: true,
    // Add CORS headers for development
    cors: true
  },
  plugins: [
    react(),
    mode === 'development' && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Define static environment variables
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
    __APP_MODE__: JSON.stringify(mode),
  },
}));
