import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import fs from "fs";
import path from "path";
import https from "https";

const certPath = path.resolve(__dirname, "certs/admin.cert");
const keyPath = path.resolve(__dirname, "certs/admin.key");

const hasCerts = fs.existsSync(certPath) && fs.existsSync(keyPath);

const agent = hasCerts
  ? new https.Agent({
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath),
      rejectUnauthorized: false,
    })
  : undefined;

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
      "/ca/rest": {
        target: "https://192.168.140.101:8443",
        changeOrigin: true,
        secure: false,
        agent,
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
