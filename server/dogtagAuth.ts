import https from "node:https";
import { URL } from "node:url";
import { caTlsOptions } from "./caTlsConfig.js";

const CA_TARGET_URL = process.env.CA_TARGET_URL || "https://localhost:8443";

export interface DogtagLoginResult {
  cookies: string;
  account: {
    id: string;
    FullName: string;
    Email: string;
    Roles: string[];
  };
}

export async function loginToDogtag(
  username: string,
  password: string,
): Promise<DogtagLoginResult | null> {
  const target = new URL("/ca/rest/account/login", CA_TARGET_URL);
  const auth = Buffer.from(`${username}:${password}`).toString("base64");

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: target.hostname,
        port: target.port || 443,
        path: target.pathname,
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${auth}`,
        },
        ...caTlsOptions,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          if (res.statusCode !== 200) {
            resolve(null);
            return;
          }

          const setCookies = res.headers["set-cookie"];
          const cookies = setCookies
            ? setCookies.map((c) => c.split(";")[0]).join("; ")
            : "";

          try {
            const body = JSON.parse(Buffer.concat(chunks).toString());
            resolve({ cookies, account: body });
          } catch {
            resolve(null);
          }
        });
      },
    );

    req.on("error", () => resolve(null));
    req.end();
  });
}

export async function checkDogtagSession(
  cookies: string,
): Promise<DogtagLoginResult | null> {
  const target = new URL("/ca/rest/account/login", CA_TARGET_URL);

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: target.hostname,
        port: target.port || 443,
        path: target.pathname,
        method: "GET",
        headers: {
          Accept: "application/json",
          Cookie: cookies,
        },
        ...caTlsOptions,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          if (res.statusCode !== 200) {
            resolve(null);
            return;
          }
          const setCookies = res.headers["set-cookie"];
          const newCookies = setCookies
            ? setCookies.map((c) => c.split(";")[0]).join("; ")
            : cookies;
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString());
            resolve({ cookies: newCookies, account: body });
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on("error", () => resolve(null));
    req.end();
  });
}

export async function logoutFromDogtag(cookies: string): Promise<void> {
  const target = new URL("/ca/rest/account/logout", CA_TARGET_URL);

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: target.hostname,
        port: target.port || 443,
        path: target.pathname,
        method: "GET",
        headers: {
          Accept: "application/json",
          Cookie: cookies,
        },
        ...caTlsOptions,
      },
      () => resolve(),
    );
    req.on("error", () => resolve());
    req.end();
  });
}
