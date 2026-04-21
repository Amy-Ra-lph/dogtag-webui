import { ROLE_ADMIN, ROLE_AGENT, ROLE_AUDITOR } from "src/auth/roles";

export interface NavRouteItem {
  label: string;
  group: string;
  path: string;
  title: string;
  requiredRoles?: string[];
}

export interface NavSection {
  label: string;
  items: NavRouteItem[];
}

const BASE_TITLE = "Dogtag PKI";

export const navigationRoutes: NavSection[] = [
  {
    label: "Overview",
    items: [
      {
        label: "Dashboard",
        group: "dashboard",
        path: "/",
        title: `${BASE_TITLE} - Dashboard`,
      },
    ],
  },
  {
    label: "PKI Management",
    items: [
      {
        label: "Certificates",
        group: "certificates",
        path: "/certificates",
        title: `${BASE_TITLE} - Certificates`,
      },
      {
        label: "Enroll",
        group: "enroll",
        path: "/enroll",
        title: `${BASE_TITLE} - Enroll Certificate`,
        requiredRoles: [ROLE_ADMIN, ROLE_AGENT],
      },
      {
        label: "Requests",
        group: "requests",
        path: "/requests",
        title: `${BASE_TITLE} - Requests`,
        requiredRoles: [ROLE_ADMIN, ROLE_AGENT],
      },
      {
        label: "Profiles",
        group: "profiles",
        path: "/profiles",
        title: `${BASE_TITLE} - Profiles`,
        requiredRoles: [ROLE_ADMIN, ROLE_AGENT],
      },
      {
        label: "Create Profile",
        group: "profile-create",
        path: "/profiles/create",
        title: `${BASE_TITLE} - Create Profile`,
        requiredRoles: [ROLE_ADMIN],
      },
      {
        label: "Authorities",
        group: "authorities",
        path: "/authorities",
        title: `${BASE_TITLE} - Authorities`,
      },
    ],
  },
  {
    label: "Access Control",
    items: [
      {
        label: "Users",
        group: "users",
        path: "/users",
        title: `${BASE_TITLE} - Users`,
        requiredRoles: [ROLE_ADMIN],
      },
      {
        label: "Groups",
        group: "groups",
        path: "/groups",
        title: `${BASE_TITLE} - Groups`,
        requiredRoles: [ROLE_ADMIN],
      },
    ],
  },
  {
    label: "Monitoring",
    items: [
      {
        label: "Audit",
        group: "audit",
        path: "/audit",
        title: `${BASE_TITLE} - Audit Log`,
        requiredRoles: [ROLE_ADMIN, ROLE_AUDITOR],
      },
    ],
  },
  {
    label: "Workload Identity",
    items: [
      {
        label: "Workload Identities",
        group: "workload-identities",
        path: "/workload-identities",
        title: `${BASE_TITLE} - Workload Identities`,
        requiredRoles: [ROLE_ADMIN, ROLE_AGENT],
      },
      {
        label: "Code Signing",
        group: "code-signing",
        path: "/code-signing",
        title: `${BASE_TITLE} - Code Signing Activity`,
        requiredRoles: [ROLE_ADMIN, ROLE_AUDITOR],
      },
      {
        label: "Trust Chain",
        group: "trust-chain",
        path: "/trust-chain",
        title: `${BASE_TITLE} - Trust Chain`,
        requiredRoles: [ROLE_ADMIN],
      },
    ],
  },
  {
    label: "Compliance",
    items: [
      {
        label: "CC Compliance",
        group: "cc-compliance",
        path: "/cc-compliance",
        title: `${BASE_TITLE} - CC Compliance`,
        requiredRoles: [ROLE_ADMIN, ROLE_AUDITOR],
      },
    ],
  },
];
