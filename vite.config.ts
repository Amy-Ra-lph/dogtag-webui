import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import fs from "fs";
import path from "path";
import https from "https";
import type { IncomingMessage } from "http";
import { authPlugin } from "./server/authMiddleware";
import type { AuthBackend } from "./server/authMiddleware";
import { createLdapBackend } from "./server/ldapBackend";

function buildAuthBackend(env: Record<string, string>): AuthBackend | undefined {
  const ldapUrl = env.VITE_LDAP_URL;
  if (!ldapUrl) return undefined;

  return createLdapBackend({
    url: ldapUrl,
    baseDn: env.VITE_LDAP_BASE_DN || "o=pki-tomcat-CA",
    bindDn: env.VITE_LDAP_BIND_DN,
    bindPassword: env.VITE_LDAP_BIND_PASSWORD,
    userSearchBase: env.VITE_LDAP_USER_SEARCH_BASE,
    groupSearchBase: env.VITE_LDAP_GROUP_SEARCH_BASE,
    tlsRejectUnauthorized: env.VITE_LDAP_TLS_REJECT_UNAUTHORIZED !== "false",
    tlsCaCertPath: env.VITE_LDAP_TLS_CA_CERT,
    startTls: env.VITE_LDAP_STARTTLS === "true",
  });
}

// Dev-only: strip Secure flag so HTTP dev server can use session cookies.
function stripSecureFromCookies(proxyRes: IncomingMessage) {
  const sc = proxyRes.headers["set-cookie"];
  if (sc) {
    proxyRes.headers["set-cookie"] = sc.map((c) =>
      c.replace(/;\s*Secure/gi, ""),
    );
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const isProd = mode === "production";

  const proxyTarget = env.VITE_CA_TARGET_URL || "https://localhost:8443";

  const certPath = path.resolve(
    __dirname,
    env.VITE_CA_CERT_PATH || "certs/admin.cert",
  );
  const keyPath = path.resolve(
    __dirname,
    env.VITE_CA_KEY_PATH || "certs/admin.key",
  );

  const hasCerts = fs.existsSync(certPath) && fs.existsSync(keyPath);

  const agent = hasCerts
    ? new https.Agent({
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath),
        rejectUnauthorized: isProd,
      })
    : undefined;

  return {
    base: "/",
    build: {
      sourcemap: !isProd,
    },
    plugins: [react(), authPlugin(buildAuthBackend(env))],
    resolve: {
      alias: {
        src: "/src",
      },
    },
    server: {
      host: env.VITE_DEV_HOST || "localhost",
      port: 5173,
      proxy: {
        "/ca/rest": {
          target: proxyTarget,
          changeOrigin: true,
          secure: isProd,
          agent,
          cookieDomainRewrite: "",
          cookiePathRewrite: "/",
          configure: (proxy) => {
            if (!isProd) {
              proxy.on("proxyRes", stripSecureFromCookies);
            }
          },
        },
      },
    },
    test: {
      projects: [
        {
          test: {
            name: "server",
            globals: true,
            include: ["server/**/*.test.ts"],
            environment: "node",
          },
        },
        {
          test: {
            name: "client",
            globals: true,
            include: ["src/**/*.test.{ts,tsx}"],
            environment: "jsdom",
            server: {
              deps: {
                inline: [/@patternfly\/.*/],
              },
            },
            setupFiles: ["./src/setupTests.ts"],
          },
        },
      ],
    },
  };
});
