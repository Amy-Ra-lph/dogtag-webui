import { Client } from "ldapts";
import fs from "node:fs";
import type { TlsOptions } from "node:tls";
import type { AuthBackend } from "./authMiddleware";

export interface LdapConfig {
  url: string;
  baseDn: string;
  bindDn?: string;
  bindPassword?: string;
  userSearchBase?: string;
  groupSearchBase?: string;
  tlsRejectUnauthorized?: boolean;
  tlsCaCertPath?: string;
  startTls?: boolean;
}

const DOGTAG_GROUP_ROLE_MAP: Record<string, string> = {
  "Administrators": "administrator",
  "Certificate Manager Agents": "agent",
  "Auditors": "auditor",
  "Enterprise CA Administrators": "administrator",
  "Enterprise KRA Administrators": "administrator",
  "Enterprise OCSP Administrators": "administrator",
  "Enterprise TKS Administrators": "administrator",
  "Enterprise TPS Administrators": "administrator",
};

function buildTlsOptions(config: LdapConfig): TlsOptions {
  const opts: TlsOptions = {
    rejectUnauthorized: config.tlsRejectUnauthorized ?? true,
  };
  if (config.tlsCaCertPath) {
    opts.ca = fs.readFileSync(config.tlsCaCertPath);
  }
  return opts;
}

export function createLdapBackend(config: LdapConfig): AuthBackend {
  const userSearchBase = config.userSearchBase ?? `ou=people,${config.baseDn}`;
  const groupSearchBase =
    config.groupSearchBase ?? `ou=groups,${config.baseDn}`;
  const tlsOptions = buildTlsOptions(config);

  return {
    async validate(username, password) {
      const client = new Client({
        url: config.url,
        tlsOptions,
        strictDN: true,
      });

      try {
        if (config.startTls) {
          await client.startTLS(tlsOptions);
        }

        // Step 1: Find the user's DN
        let userDn: string;
        let fullName = username;
        let email = "";

        if (config.bindDn && config.bindPassword) {
          await client.bind(config.bindDn, config.bindPassword);
        }

        const { searchEntries } = await client.search(userSearchBase, {
          scope: "one",
          filter: `(uid=${escapeLdapFilter(username)})`,
          attributes: ["dn", "cn", "mail", "sn", "givenName"],
        });

        if (searchEntries.length === 0) return null;

        const userEntry = searchEntries[0];
        userDn = userEntry.dn;
        fullName = String(userEntry.cn ?? username);
        email = String(userEntry.mail ?? "");

        // Step 2: Verify password by binding as the user
        await client.unbind();
        const userClient = new Client({
          url: config.url,
          tlsOptions,
          strictDN: true,
        });

        try {
          if (config.startTls) {
            await userClient.startTLS(tlsOptions);
          }
          await userClient.bind(userDn, password);
        } catch {
          return null;
        } finally {
          await userClient.unbind().catch(() => {});
        }

        // Step 3: Look up group memberships
        await client.bind(
          config.bindDn ?? userDn,
          config.bindDn ? (config.bindPassword ?? password) : password,
        );

        const { searchEntries: groups } = await client.search(
          groupSearchBase,
          {
            scope: "one",
            filter: `(&(objectClass=groupOfUniqueNames)(uniqueMember=${escapeLdapFilter(userDn)}))`,
            attributes: ["cn"],
          },
        );

        const roles: string[] = [];
        for (const group of groups) {
          const cn = String(group.cn ?? "");
          const role = DOGTAG_GROUP_ROLE_MAP[cn];
          if (role && !roles.includes(role)) {
            roles.push(role);
          }
        }

        if (roles.length === 0) return null;

        return { fullName, email, roles };
      } catch {
        return null;
      } finally {
        await client.unbind().catch(() => {});
      }
    },
  };
}

function escapeLdapFilter(value: string): string {
  return value.replace(/[\\*()\/\0]/g, (ch) => {
    return "\\" + ch.charCodeAt(0).toString(16).padStart(2, "0");
  });
}
