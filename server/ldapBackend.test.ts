// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("ldapts", () => {
  const mockClient = {
    bind: vi.fn(),
    unbind: vi.fn(),
    search: vi.fn(),
  };
  return { Client: vi.fn(() => mockClient), __mockClient: mockClient };
});

import { Client } from "ldapts";
import { createLdapBackend } from "./ldapBackend";

describe("createLdapBackend", () => {
  let clientInstances: Array<{
    bind: ReturnType<typeof vi.fn>;
    unbind: ReturnType<typeof vi.fn>;
    search: ReturnType<typeof vi.fn>;
  }>;

  beforeEach(() => {
    vi.clearAllMocks();
    clientInstances = [];

    (Client as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      const instance = {
        bind: vi.fn().mockResolvedValue(undefined),
        unbind: vi.fn().mockResolvedValue(undefined),
        search: vi.fn().mockResolvedValue({ searchEntries: [] }),
      };
      clientInstances.push(instance);
      return instance;
    });
  });

  const config = {
    url: "ldap://localhost:389",
    baseDn: "o=pki-tomcat-CA",
    bindDn: "cn=Directory Manager",
    bindPassword: "Secret.123",
  };

  it("returns null when user is not found", async () => {
    const backend = createLdapBackend(config);
    const result = await backend.validate("nobody", "pass");
    expect(result).toBeNull();
  });

  it("returns null when password is wrong", async () => {
    const backend = createLdapBackend(config);

    clientInstances = [];
    (Client as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      const idx = clientInstances.length;
      const instance = {
        bind: vi.fn().mockImplementation(() => {
          if (idx === 1) throw new Error("invalid credentials");
          return Promise.resolve();
        }),
        unbind: vi.fn().mockResolvedValue(undefined),
        search: vi.fn().mockResolvedValue({
          searchEntries: [
            {
              dn: "uid=caadmin,ou=people,o=pki-tomcat-CA",
              cn: "CA Administrator",
              mail: "caadmin@test.example.com",
            },
          ],
        }),
      };
      clientInstances.push(instance);
      return instance;
    });

    const result = await backend.validate("caadmin", "wrongpass");
    expect(result).toBeNull();
  });

  it("returns user with roles on successful auth", async () => {
    const backend = createLdapBackend(config);

    let callCount = 0;
    (Client as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      const instance = {
        bind: vi.fn().mockResolvedValue(undefined),
        unbind: vi.fn().mockResolvedValue(undefined),
        search: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return {
              searchEntries: [
                {
                  dn: "uid=caadmin,ou=people,o=pki-tomcat-CA",
                  cn: "CA Administrator",
                  mail: "caadmin@test.example.com",
                },
              ],
            };
          }
          return {
            searchEntries: [
              { cn: "Administrators" },
              { cn: "Certificate Manager Agents" },
            ],
          };
        }),
      };
      clientInstances.push(instance);
      return instance;
    });

    const result = await backend.validate("caadmin", "Secret.123");
    expect(result).not.toBeNull();
    expect(result!.fullName).toBe("CA Administrator");
    expect(result!.email).toBe("caadmin@test.example.com");
    expect(result!.roles).toContain("administrator");
    expect(result!.roles).toContain("agent");
  });

  it("returns null when user has no mapped roles", async () => {
    const backend = createLdapBackend(config);

    let callCount = 0;
    (Client as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      const instance = {
        bind: vi.fn().mockResolvedValue(undefined),
        unbind: vi.fn().mockResolvedValue(undefined),
        search: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return {
              searchEntries: [
                {
                  dn: "uid=nobody,ou=people,o=pki-tomcat-CA",
                  cn: "Nobody",
                  mail: "",
                },
              ],
            };
          }
          return { searchEntries: [{ cn: "Some Other Group" }] };
        }),
      };
      clientInstances.push(instance);
      return instance;
    });

    const result = await backend.validate("nobody", "pass");
    expect(result).toBeNull();
  });

  it("maps auditor group correctly", async () => {
    const backend = createLdapBackend(config);

    let callCount = 0;
    (Client as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      const instance = {
        bind: vi.fn().mockResolvedValue(undefined),
        unbind: vi.fn().mockResolvedValue(undefined),
        search: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return {
              searchEntries: [
                {
                  dn: "uid=auditor1,ou=people,o=pki-tomcat-CA",
                  cn: "Auditor User",
                  mail: "auditor1@test.example.com",
                },
              ],
            };
          }
          return { searchEntries: [{ cn: "Auditors" }] };
        }),
      };
      clientInstances.push(instance);
      return instance;
    });

    const result = await backend.validate("auditor1", "pass");
    expect(result).not.toBeNull();
    expect(result!.roles).toEqual(["auditor"]);
  });

  it("does not duplicate roles", async () => {
    const backend = createLdapBackend(config);

    let callCount = 0;
    (Client as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      const instance = {
        bind: vi.fn().mockResolvedValue(undefined),
        unbind: vi.fn().mockResolvedValue(undefined),
        search: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return {
              searchEntries: [
                {
                  dn: "uid=superadmin,ou=people,o=pki-tomcat-CA",
                  cn: "Super Admin",
                  mail: "",
                },
              ],
            };
          }
          return {
            searchEntries: [
              { cn: "Administrators" },
              { cn: "Enterprise CA Administrators" },
            ],
          };
        }),
      };
      clientInstances.push(instance);
      return instance;
    });

    const result = await backend.validate("superadmin", "pass");
    expect(result).not.toBeNull();
    const adminCount = result!.roles.filter(
      (r) => r === "administrator",
    ).length;
    expect(adminCount).toBe(1);
  });

  it("uses custom search bases when provided", async () => {
    const customConfig = {
      ...config,
      userSearchBase: "ou=users,dc=example,dc=com",
      groupSearchBase: "ou=roles,dc=example,dc=com",
    };
    const backend = createLdapBackend(customConfig);

    const searchBases: string[] = [];
    let callCount = 0;
    (Client as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      const instance = {
        bind: vi.fn().mockResolvedValue(undefined),
        unbind: vi.fn().mockResolvedValue(undefined),
        search: vi.fn().mockImplementation((base: string) => {
          searchBases.push(base);
          callCount++;
          if (callCount === 1) {
            return {
              searchEntries: [
                {
                  dn: "uid=user,ou=users,dc=example,dc=com",
                  cn: "User",
                  mail: "",
                },
              ],
            };
          }
          return { searchEntries: [{ cn: "Administrators" }] };
        }),
      };
      clientInstances.push(instance);
      return instance;
    });

    await backend.validate("user", "pass");
    expect(searchBases[0]).toBe("ou=users,dc=example,dc=com");
    expect(searchBases[1]).toBe("ou=roles,dc=example,dc=com");
  });

  it("returns null on LDAP connection error", async () => {
    const backend = createLdapBackend(config);

    (Client as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      bind: vi.fn().mockRejectedValue(new Error("connection refused")),
      unbind: vi.fn().mockResolvedValue(undefined),
      search: vi.fn(),
    }));

    const result = await backend.validate("user", "pass");
    expect(result).toBeNull();
  });
});
