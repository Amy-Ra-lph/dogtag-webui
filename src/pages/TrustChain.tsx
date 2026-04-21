import React from "react";
import {
  PageSection,
  PageSectionVariants,
  Content,
  Spinner,
  Bullseye,
  Card,
  CardBody,
  Label,
  Flex,
  FlexItem,
  Button,
  DrawerPanelContent,
  DrawerHead,
  DrawerActions,
  DrawerCloseButton,
  Drawer,
  DrawerContent,
  DrawerContentBody,
  DescriptionList,
  DescriptionListGroup,
  DescriptionListTerm,
  DescriptionListDescription,
} from "@patternfly/react-core";
import { useNavigate } from "react-router";
import BreadcrumbLayout from "src/components/BreadcrumbLayout";
import ErrorBanner from "src/components/ErrorBanner";
import {
  useGetAuthoritiesQuery,
  useGetCertificatesQuery,
  dogtagApi,
  type AuthorityData,
} from "src/services/dogtagApi";
import { useAppDispatch } from "src/store/store";
import {
  extractCN,
  extractURISANs,
  hasCodeSigningEKU,
} from "src/utils/certUtils";
import type { TrustChainNode } from "src/types/spire";

const FETCH_BATCH = 100;

function classifyAuthority(
  authority: AuthorityData,
  certTypes: Map<string, "spire" | "fulcio" | "standard">,
): TrustChainNode["nodeType"] {
  if (authority.isHostAuthority) return "root";
  const typ = certTypes.get(authority.dn);
  if (typ === "spire") return "spire-intermediate";
  if (typ === "fulcio") return "fulcio-intermediate";
  return "sub-ca";
}

function buildTree(
  authorities: AuthorityData[],
  certTypes: Map<string, "spire" | "fulcio" | "standard">,
  certCounts: Map<string, number>,
): TrustChainNode[] {
  const nodeMap = new Map<string, TrustChainNode>();

  for (const auth of authorities) {
    nodeMap.set(auth.dn, {
      id: auth.id,
      dn: auth.dn,
      issuerDN: auth.issuerDN ?? null,
      label: extractCN(auth.dn),
      nodeType: classifyAuthority(auth, certTypes),
      enabled: auth.enabled,
      ready: auth.ready ?? false,
      certCount: certCounts.get(auth.dn) ?? 0,
      children: [],
    });
  }

  const roots: TrustChainNode[] = [];
  for (const node of nodeMap.values()) {
    if (node.issuerDN && nodeMap.has(node.issuerDN)) {
      nodeMap.get(node.issuerDN)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

const nodeTypeColors: Record<
  TrustChainNode["nodeType"],
  "blue" | "teal" | "purple" | "grey"
> = {
  root: "blue",
  "spire-intermediate": "teal",
  "fulcio-intermediate": "purple",
  "sub-ca": "grey",
};

const nodeTypeLabels: Record<TrustChainNode["nodeType"], string> = {
  root: "Root CA",
  "spire-intermediate": "SPIRE Intermediate",
  "fulcio-intermediate": "Fulcio Intermediate",
  "sub-ca": "Sub-CA",
};

interface TreeNodeProps {
  node: TrustChainNode;
  depth: number;
  onSelect: (node: TrustChainNode) => void;
}

const TreeNode: React.FC<TreeNodeProps> = ({ node, depth, onSelect }) => {
  return (
    <div style={{ marginLeft: depth * 32 }}>
      <Card
        isClickable
        isCompact
        onClick={() => onSelect(node)}
        className="pf-v6-u-mb-sm"
      >
        <CardBody>
          <Flex
            spaceItems={{ default: "spaceItemsSm" }}
            alignItems={{ default: "alignItemsCenter" }}
          >
            <FlexItem>
              <strong>{node.label}</strong>
            </FlexItem>
            <FlexItem>
              <Label color={nodeTypeColors[node.nodeType]} isCompact>
                {nodeTypeLabels[node.nodeType]}
              </Label>
            </FlexItem>
            <FlexItem>
              <Label
                color={node.enabled && node.ready ? "green" : "orange"}
                isCompact
              >
                {node.enabled
                  ? node.ready
                    ? "Ready"
                    : "Not Ready"
                  : "Disabled"}
              </Label>
            </FlexItem>
            {node.certCount > 0 && (
              <FlexItem>
                <Label color="grey" isCompact>
                  {node.certCount} cert{node.certCount !== 1 ? "s" : ""}
                </Label>
              </FlexItem>
            )}
          </Flex>
        </CardBody>
      </Card>
      {node.children.map((child) => (
        <TreeNode
          key={child.id}
          node={child}
          depth={depth + 1}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
};

const TrustChain: React.FC = () => {
  React.useEffect(() => {
    document.title = "Dogtag PKI - Trust Chain";
  }, []);

  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [selectedNode, setSelectedNode] = React.useState<TrustChainNode | null>(
    null,
  );

  const {
    data: authData,
    isLoading: authLoading,
    error: authError,
  } = useGetAuthoritiesQuery();
  const { data: certData, isLoading: certsLoading } = useGetCertificatesQuery({
    start: 0,
    size: FETCH_BATCH,
  });

  const authorities: AuthorityData[] = Array.isArray(authData) ? authData : [];
  const certs = certData?.entries ?? [];

  const [certTypes, setCertTypes] = React.useState<
    Map<string, "spire" | "fulcio" | "standard">
  >(new Map());
  const [typesScanned, setTypesScanned] = React.useState(false);

  React.useEffect(() => {
    if (certs.length === 0 || typesScanned) return;

    let cancelled = false;

    Promise.all(
      certs.map((c) =>
        dispatch(dogtagApi.endpoints.getAgentCert.initiate(c.id))
          .unwrap()
          .then((detail) => ({
            issuerDN: c.IssuerDN,
            prettyPrint: detail.PrettyPrint ?? "",
          }))
          .catch(() => ({ issuerDN: c.IssuerDN, prettyPrint: "" })),
      ),
    ).then((results) => {
      if (cancelled) return;
      const types = new Map<string, "spire" | "fulcio" | "standard">();
      for (const { issuerDN, prettyPrint } of results) {
        const uris = extractURISANs(prettyPrint);
        const hasSpiffe = uris.some((u) => u.startsWith("spiffe://"));
        const hasCS = hasCodeSigningEKU(prettyPrint);

        if (hasSpiffe && !types.has(issuerDN)) {
          types.set(issuerDN, "spire");
        } else if (hasCS && !types.has(issuerDN)) {
          types.set(issuerDN, "fulcio");
        }
      }
      setCertTypes(types);
      setTypesScanned(true);
    });

    return () => {
      cancelled = true;
    };
  }, [certs, dispatch, typesScanned]);

  const certCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of certs) {
      counts.set(c.IssuerDN, (counts.get(c.IssuerDN) ?? 0) + 1);
    }
    return counts;
  }, [certs]);

  const tree = React.useMemo(
    () => buildTree(authorities, certTypes, certCounts),
    [authorities, certTypes, certCounts],
  );

  const loading = authLoading || certsLoading;

  const panelContent = selectedNode ? (
    <DrawerPanelContent widths={{ default: "width_33" }}>
      <DrawerHead>
        <Content component="h3">{selectedNode.label}</Content>
        <DrawerActions>
          <DrawerCloseButton onClick={() => setSelectedNode(null)} />
        </DrawerActions>
      </DrawerHead>
      <div className="pf-v6-u-p-md">
        <DescriptionList isHorizontal isCompact>
          <DescriptionListGroup>
            <DescriptionListTerm>DN</DescriptionListTerm>
            <DescriptionListDescription>
              <code>{selectedNode.dn}</code>
            </DescriptionListDescription>
          </DescriptionListGroup>
          {selectedNode.issuerDN && (
            <DescriptionListGroup>
              <DescriptionListTerm>Issuer DN</DescriptionListTerm>
              <DescriptionListDescription>
                <code>{selectedNode.issuerDN}</code>
              </DescriptionListDescription>
            </DescriptionListGroup>
          )}
          <DescriptionListGroup>
            <DescriptionListTerm>Type</DescriptionListTerm>
            <DescriptionListDescription>
              <Label color={nodeTypeColors[selectedNode.nodeType]} isCompact>
                {nodeTypeLabels[selectedNode.nodeType]}
              </Label>
            </DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>Status</DescriptionListTerm>
            <DescriptionListDescription>
              <Label
                color={
                  selectedNode.enabled && selectedNode.ready
                    ? "green"
                    : "orange"
                }
                isCompact
              >
                {selectedNode.enabled
                  ? selectedNode.ready
                    ? "Enabled & Ready"
                    : "Enabled, Not Ready"
                  : "Disabled"}
              </Label>
            </DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>Certificates Issued</DescriptionListTerm>
            <DescriptionListDescription>
              {selectedNode.certCount}
            </DescriptionListDescription>
          </DescriptionListGroup>
        </DescriptionList>
        <div className="pf-v6-u-mt-md">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate("/certificates")}
          >
            View Certificates
          </Button>
        </div>
      </div>
    </DrawerPanelContent>
  ) : undefined;

  return (
    <>
      <PageSection hasBodyWrapper={false} variant={PageSectionVariants.default}>
        <BreadcrumbLayout
          items={[{ name: "Trust Chain", url: "/trust-chain" }]}
        />
        <Content component="h1">Trust Chain</Content>
        <Content component="p">
          CA hierarchy including SPIRE and Fulcio intermediates.
        </Content>
      </PageSection>
      <PageSection hasBodyWrapper={false} isFilled>
        {authError && <ErrorBanner message="Failed to load authorities." />}
        {loading ? (
          <Bullseye>
            <Spinner size="xl" />
          </Bullseye>
        ) : (
          <Drawer isExpanded={!!selectedNode}>
            <DrawerContent panelContent={panelContent}>
              <DrawerContentBody>
                {tree.length === 0 ? (
                  <Content component="small">
                    No certificate authorities found.
                  </Content>
                ) : (
                  tree.map((root) => (
                    <TreeNode
                      key={root.id}
                      node={root}
                      depth={0}
                      onSelect={setSelectedNode}
                    />
                  ))
                )}
              </DrawerContentBody>
            </DrawerContent>
          </Drawer>
        )}
      </PageSection>
    </>
  );
};

export default TrustChain;
