import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

// -----------------------------------------------------------------
// Dogtag PKI REST API types
// -----------------------------------------------------------------

export interface AccountInfo {
  id: string;
  FullName: string;
  Email: string;
  Roles: string[];
}

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

export interface CertDetail extends CertInfo {
  PrettyPrint?: string;
  Encoded?: string;
  NotBefore?: string;
  NotAfter?: string;
  Nonce?: number;
}

export interface CertRevokeRequest {
  Reason: string;
  Nonce: number;
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

// Profile detail types (full profile definition for create/modify)
export interface ProfileParam {
  name: string;
  value: string;
  descriptor?: { Syntax: string; Description: string };
}

export interface PolicyDefault {
  name: string;
  classId: string;
  text?: string;
  attributes?: ProfileParam[];
  params?: ProfileParam[];
}

export interface PolicyConstraint {
  name: string;
  classId?: string;
  text?: string;
  constraints?: ProfileParam[];
}

export interface ProfilePolicy {
  id: string;
  def: PolicyDefault;
  constraint: PolicyConstraint;
}

export interface ProfileInput {
  id: string;
  classId?: string;
  name?: string;
  attributes?: ProfileParam[];
}

export interface ProfileOutput {
  id: string;
  classId?: string;
  name?: string;
  attributes?: ProfileParam[];
}

export interface ProfileDetail {
  id: string;
  classId: string;
  name: string;
  description: string;
  enabled: boolean;
  visible: boolean;
  enabledBy?: string;
  authenticatorId?: string;
  authzAcl?: string;
  renewal?: boolean;
  xmlOutput?: boolean;
  inputs?: ProfileInput[];
  outputs?: ProfileOutput[];
  policySets?: Record<string, ProfilePolicy[]>;
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

const baseQuery = fetchBaseQuery({
  baseUrl: "/ca/rest/",
  credentials: "include",
  timeout: 30_000,
  prepareHeaders: (headers) => {
    headers.set("Accept", "application/json");
    headers.set("Content-Type", "application/json");
    return headers;
  },
});

export const dogtagApi = createApi({
  reducerPath: "dogtagApi",
  baseQuery,
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
    getAgentCert: build.query<CertDetail, string>({
      query: (id) => `agent/certs/${id}`,
    }),
    revokeCert: build.mutation<
      void,
      { certId: string; body: CertRevokeRequest }
    >({
      query: ({ certId, body }) => ({
        url: `agent/certs/${certId}/revoke`,
        method: "POST",
        body,
      }),
      invalidatesTags: ["Certificates"],
    }),

    // ---- Account ----
    getAccountInfo: build.query<AccountInfo, void>({
      query: () => "account/login",
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
    getProfileDetail: build.query<ProfileDetail, string>({
      query: (profileId) => `profiles/${profileId}`,
      providesTags: (_result, _error, id) => [{ type: "Profiles", id }],
    }),
    createProfile: build.mutation<ProfileDetail, ProfileDetail>({
      query: (body) => ({
        url: "profiles",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Profiles"],
    }),
    modifyProfile: build.mutation<
      ProfileDetail,
      { profileId: string; body: ProfileDetail }
    >({
      query: ({ profileId, body }) => ({
        url: `profiles/${profileId}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: ["Profiles"],
    }),
    enableProfile: build.mutation<void, string>({
      query: (profileId) => ({
        url: `profiles/${profileId}`,
        method: "POST",
        params: { action: "enable" },
      }),
      invalidatesTags: ["Profiles"],
    }),
    disableProfile: build.mutation<void, string>({
      query: (profileId) => ({
        url: `profiles/${profileId}`,
        method: "POST",
        params: { action: "disable" },
      }),
      invalidatesTags: ["Profiles"],
    }),
    deleteProfile: build.mutation<void, string>({
      query: (profileId) => ({
        url: `profiles/${profileId}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Profiles"],
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
  useGetAgentCertQuery,
  useRevokeCertMutation,
  useGetAccountInfoQuery,
  useGetCertRequestsQuery,
  useGetRequestReviewQuery,
  useApproveRequestMutation,
  useRejectRequestMutation,
  useCancelRequestMutation,
  useGetEnrollmentTemplateQuery,
  useEnrollCertificateMutation,
  useGetProfilesQuery,
  useGetProfileDetailQuery,
  useCreateProfileMutation,
  useModifyProfileMutation,
  useEnableProfileMutation,
  useDisableProfileMutation,
  useDeleteProfileMutation,
  useGetUsersQuery,
  useGetGroupsQuery,
  useGetAuditConfigQuery,
  useGetAuthoritiesQuery,
} = dogtagApi;

export function extractApiError(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data: unknown }).data;
    if (data && typeof data === "object" && "Message" in data) {
      const msg = String((data as { Message: string }).Message);
      if (msg.length > 200) return fallback;
      if (/exception|stack|trace|\.java|\.class/i.test(msg)) return fallback;
      return msg;
    }
  }
  return fallback;
}
