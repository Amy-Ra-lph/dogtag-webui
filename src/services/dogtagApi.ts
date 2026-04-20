import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

// -----------------------------------------------------------------
// Dogtag PKI REST API types
// These mirror the JSON structures returned by the Dogtag CA REST API.
// -----------------------------------------------------------------

export interface CertInfo {
  id: string;
  SubjectDN: string;
  IssuerDN: string;
  Status: string;
  Type: string;
  Version: number;
  KeyLength: number;
  KeyAlgorithmOID: string;
  NotValidBefore: string;
  NotValidAfter: string;
  IssuedOn: string;
  IssuedBy: string;
  PKCS7CertChain?: string;
  Link?: HateoasLink;
}

export interface CertRequestInfo {
  RequestID: string;
  RequestType: string;
  RequestStatus: string;
  CertRequestType: string;
  OperationResult: string;
  CertId?: string;
  ErrorMessage?: string;
  Link?: HateoasLink;
}

export interface ProfileData {
  id: string;
  classId: string;
  name: string;
  description: string;
  enabled: boolean;
  visible: boolean;
  Link?: HateoasLink;
}

export interface UserData {
  id: string;
  UserID: string;
  FullName: string;
  Email?: string;
  State?: string;
  Type?: string;
  Link?: HateoasLink;
}

export interface GroupData {
  id: string;
  GroupID: string;
  Description?: string;
  Link?: HateoasLink;
}

export interface HateoasLink {
  rel: string;
  href: string;
  type: string;
}

// Collection wrappers returned by the Dogtag REST API
export interface CertCollection {
  total: number;
  entries: CertInfo[];
}

export interface CertRequestCollection {
  total: number;
  entries: CertRequestInfo[];
}

export interface ProfileCollection {
  total: number;
  entries: ProfileData[];
}

export interface UserCollection {
  total: number;
  entries: UserData[];
}

export interface GroupCollection {
  total: number;
  entries: GroupData[];
}

// -----------------------------------------------------------------
// RTK Query API definition
// Base URL targets the Dogtag CA REST API, proxied via Vite in dev.
// -----------------------------------------------------------------

export const dogtagApi = createApi({
  reducerPath: "dogtagApi",
  baseQuery: fetchBaseQuery({
    baseUrl: "/ca/rest/",
    prepareHeaders: (headers) => {
      headers.set("Accept", "application/json");
      headers.set("Content-Type", "application/json");
      return headers;
    },
  }),
  tagTypes: [
    "Certificates",
    "CertRequests",
    "Profiles",
    "Users",
    "Groups",
  ],
  endpoints: (build) => ({
    // ---- Certificates ----
    getCertificates: build.query<CertCollection, { start?: number; size?: number } | void>({
      query: (params) => ({
        url: "certs",
        params: params ?? undefined,
      }),
      providesTags: ["Certificates"],
    }),
    getCertificate: build.query<CertInfo, string>({
      query: (id) => `certs/${id}`,
      providesTags: (_result, _error, id) => [{ type: "Certificates", id }],
    }),

    // ---- Certificate Requests ----
    getCertRequests: build.query<CertRequestCollection, { start?: number; size?: number } | void>({
      query: (params) => ({
        url: "certrequests",
        params: params ?? undefined,
      }),
      providesTags: ["CertRequests"],
    }),

    // ---- Profiles ----
    getProfiles: build.query<ProfileCollection, void>({
      query: () => "profiles",
      providesTags: ["Profiles"],
    }),

    // ---- Users ----
    getUsers: build.query<UserCollection, void>({
      query: () => "admin/users",
      providesTags: ["Users"],
    }),

    // ---- Groups ----
    getGroups: build.query<GroupCollection, void>({
      query: () => "admin/groups",
      providesTags: ["Groups"],
    }),
  }),
});

export const {
  useGetCertificatesQuery,
  useGetCertificateQuery,
  useGetCertRequestsQuery,
  useGetProfilesQuery,
  useGetUsersQuery,
  useGetGroupsQuery,
} = dogtagApi;
