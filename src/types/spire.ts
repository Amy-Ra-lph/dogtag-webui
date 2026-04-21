export interface SpiffeId {
  raw: string;
  trustDomain: string;
  workloadPath: string;
}

export interface SvidRecord {
  certId: string;
  spiffeId: SpiffeId;
  serialNumber: string;
  subjectDN: string;
  issuerDN: string;
  issuedOn: number;
  notValidBefore: number;
  notValidAfter: number;
  status: string;
}

export interface CodeSigningRecord {
  certId: string;
  serialNumber: string;
  signerIdentity: string;
  issuerDN: string;
  issuedOn: number;
  notValidBefore: number;
  notValidAfter: number;
  validityWindowMinutes: number;
  status: string;
  rekorLogIndex?: number;
  rekorUuid?: string;
}

export interface TrustChainNode {
  id: string;
  dn: string;
  issuerDN: string | null;
  label: string;
  nodeType: "root" | "spire-intermediate" | "fulcio-intermediate" | "sub-ca";
  enabled: boolean;
  ready: boolean;
  certCount: number;
  children: TrustChainNode[];
}
