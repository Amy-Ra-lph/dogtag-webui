import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

export interface RekorEntry {
  uuid: string;
  body: string;
  integratedTime: number;
  logID: string;
  logIndex: number;
  verification: {
    inclusionProof: {
      checkpoint: string;
      hashes: string[];
      logIndex: number;
      rootHash: string;
      treeSize: number;
    };
    signedEntryTimestamp: string;
  };
}

export type RekorSearchResult = Record<string, RekorEntry>;

export const rekorApi = createApi({
  reducerPath: "rekorApi",
  baseQuery: fetchBaseQuery({
    baseUrl: "/rekor/api/v1/",
    timeout: 10_000,
  }),
  endpoints: (build) => ({
    searchByHash: build.query<string[], string>({
      query: (hash) => ({
        url: "index/retrieve",
        method: "POST",
        body: { hash: `sha256:${hash}` },
      }),
    }),
    getEntry: build.query<RekorSearchResult, string>({
      query: (uuid) => `log/entries/${uuid}`,
    }),
  }),
});

export const { useSearchByHashQuery, useGetEntryQuery } = rekorApi;
