import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";

// https://vite.dev/config/
export default defineConfig({
  base: "/",
  build: {
    sourcemap: true,
  },
  plugins: [react()],
  resolve: {
    alias: {
      src: "/src",
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      // Proxy Dogtag CA REST API calls to the backend
      "/ca/rest": {
        target: "https://localhost:8443",
        changeOrigin: true,
        secure: false, // Accept self-signed certs in dev
      },
    },
  },
  test: {
    environment: "jsdom",
    server: {
      deps: {
        inline: [/@patternfly\/.*/],
      },
    },
    setupFiles: ["./src/setupTests.ts"],
  },
});
