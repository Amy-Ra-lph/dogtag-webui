import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

// -----------------------------------------------------------------
// Dogtag PKI REST API types
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
  NotValidBefore: number;
  NotValidAfter: number;
  IssuedOn: number;
  IssuedBy: string;
  PKCS7CertChain?: string;
  Link?: HateoasLink;
}

export interface CertRequestInfo {
  requestID: string;
  requestType: string;
  requestStatus: string;
  certRequestType?: string;
  operationResult: string;
  certId?: string;
  errorMessage?: string;
  creationTime?: number;
  modificationTime?: number;
}

export interface ProfileData {
  id: string;
  classId: string;
  name: string;
  description: string;
  enabled: boolean;
  visible: boolean;
  profileId?: string;
  profileName?: string;
  profileDescription?: string;
  profileEnabled?: boolean | string;
  profileVisible?: boolean | string;
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

export interface AuditConfig {
  Status: string;
  Signed: boolean;
  Interval: number;
  bufferSize: number;
  Events: Record<string, string>;
}

export interface AuthorityData {
  id: string;
  dn: string;
  issuerDN?: string;
  enabled: boolean;
  description?: string;
  isHostAuthority?: boolean;
  serial?: number;
  ready?: boolean;
}

// Enrollment types
export interface EnrollmentAttribute {
  name: string;
  Value: string;
  Descriptor?: {
    Syntax: string;
    Description: string;
  };
}

export interface EnrollmentInput {
  id: string;
  ClassID: string;
  Name: string;
  ConfigAttribute: unknown[];
  Attribute: EnrollmentAttribute[];
}

export interface EnrollmentTemplate {
  ProfileID: string;
  Renewal: boolean;
  Input: EnrollmentInput[];
  Output: unknown[];
}

export interface EnrollmentRequest {
  ProfileID: string;
  Renewal: boolean;
  Input: {
    id: string;
    ClassID: string;
    Name: string;
    Attribute: { name: string; Value: string }[];
  }[];
}

export interface EnrollmentResponse {
  entries: CertRequestInfo[];
}

// Agent review types
export interface CertReviewResponse {
  nonce: string;
  requestId: string;
  requestType: string;
  requestStatus: string;
  requestCreationTime: string;
  requestNotes: string;
  ProfileID: string;
  profileName: string;
  profileDescription: string;
  Input: EnrollmentInput[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ProfilePolicySet: any[];
  [key: string]: unknown;
}

// -----------------------------------------------------------------
// RTK Query API definition
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
    "Audit",
    "Authorities",
  ],
  endpoints: (build) => ({
    // ---- Certificates ----
    getCertificates: build.query<
      CertCollection,
      { start?: number; size?: number } | void
    >({
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

    // ---- Certificate Requests (agent endpoint) ----
    getCertRequests: build.query<
      CertRequestCollection,
      { start?: number; size?: number } | void
    >({
      query: (params) => ({
        url: "agent/certrequests",
        params: params ?? undefined,
      }),
      providesTags: ["CertRequests"],
    }),

    // ---- Agent review/approve/reject ----
    getRequestReview: build.query<CertReviewResponse, string>({
      query: (requestId) => `agent/certrequests/${requestId}`,
    }),
    approveRequest: build.mutation<void, { requestId: string; body: unknown }>({
      query: ({ requestId, body }) => ({
        url: `agent/certrequests/${requestId}/approve`,
        method: "POST",
        body,
      }),
      invalidatesTags: ["CertRequests", "Certificates"],
    }),
    rejectRequest: build.mutation<void, { requestId: string; body: unknown }>({
      query: ({ requestId, body }) => ({
        url: `agent/certrequests/${requestId}/reject`,
        method: "POST",
        body,
      }),
      invalidatesTags: ["CertRequests"],
    }),
    cancelRequest: build.mutation<void, { requestId: string; body: unknown }>({
      query: ({ requestId, body }) => ({
        url: `agent/certrequests/${requestId}/cancel`,
        method: "POST",
        body,
      }),
      invalidatesTags: ["CertRequests"],
    }),

    // ---- Enrollment ----
    getEnrollmentTemplate: build.query<EnrollmentTemplate, string>({
      query: (profileId) => `certrequests/profiles/${profileId}`,
    }),
    enrollCertificate: build.mutation<EnrollmentResponse, EnrollmentRequest>({
      query: (body) => ({
        url: "certrequests",
        method: "POST",
        body,
      }),
      invalidatesTags: ["CertRequests"],
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

    // ---- Audit ----
    getAuditConfig: build.query<AuditConfig, void>({
      query: () => "audit",
      providesTags: ["Audit"],
    }),

    // ---- Authorities ----
    getAuthorities: build.query<AuthorityData[], void>({
      query: () => "authorities",
      providesTags: ["Authorities"],
    }),
  }),
});

export const {
  useGetCertificatesQuery,
  useGetCertificateQuery,
  useGetCertRequestsQuery,
  useGetRequestReviewQuery,
  useApproveRequestMutation,
  useRejectRequestMutation,
  useCancelRequestMutation,
  useGetEnrollmentTemplateQuery,
  useEnrollCertificateMutation,
  useGetProfilesQuery,
  useGetUsersQuery,
  useGetGroupsQuery,
  useGetAuditConfigQuery,
  useGetAuthoritiesQuery,
} = dogtagApi;
