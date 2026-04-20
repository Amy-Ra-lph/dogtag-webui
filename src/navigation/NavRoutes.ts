// Navigation route definitions for the Dogtag PKI WebUI sidebar.

export interface NavRouteItem {
  label: string;
  group: string;
  path: string;
  title: string;
}

export interface NavSection {
  label: string;
  items: NavRouteItem[];
}

const BASE_TITLE = "Dogtag PKI";

export const navigationRoutes: NavSection[] = [
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
      },
      {
        label: "Requests",
        group: "requests",
        path: "/requests",
        title: `${BASE_TITLE} - Requests`,
      },
      {
        label: "Profiles",
        group: "profiles",
        path: "/profiles",
        title: `${BASE_TITLE} - Profiles`,
      },
      {
        label: "Create Profile",
        group: "profile-create",
        path: "/profiles/create",
        title: `${BASE_TITLE} - Create Profile`,
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
      },
      {
        label: "Groups",
        group: "groups",
        path: "/groups",
        title: `${BASE_TITLE} - Groups`,
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
      },
    ],
  },
];
