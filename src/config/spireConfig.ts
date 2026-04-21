export interface SpireSigstoreConfig {
  spireApiUrl: string | null;
  rekorUrl: string | null;
  fulcioIssuerDN: string | null;
  trustDomain: string | null;
}

export const spireSigstoreConfig: SpireSigstoreConfig = {
  spireApiUrl: import.meta.env.VITE_SPIRE_API_URL ?? null,
  rekorUrl: import.meta.env.VITE_REKOR_URL ?? null,
  fulcioIssuerDN: import.meta.env.VITE_FULCIO_ISSUER_DN ?? null,
  trustDomain: import.meta.env.VITE_SPIFFE_TRUST_DOMAIN ?? null,
};
