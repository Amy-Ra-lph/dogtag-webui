import React from "react";
import {
  PageSection,
  PageSectionVariants,
  Content,
  Card,
  CardTitle,
  CardBody,
  Spinner,
  Bullseye,
  DescriptionList,
  DescriptionListGroup,
  DescriptionListTerm,
  DescriptionListDescription,
  Label,
  Button,
  Alert,
  CodeBlock,
  CodeBlockCode,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  FormGroup,
  FormSelect,
  FormSelectOption,
  Flex,
  FlexItem,
  ClipboardCopy,
} from "@patternfly/react-core";
import { useParams, useNavigate } from "react-router";
import BreadcrumbLayout from "src/components/BreadcrumbLayout";
import StatusLabel from "src/components/StatusLabel";
import {
  useGetAgentCertQuery,
  useRevokeCertMutation,
  extractApiError,
} from "src/services/dogtagApi";

const REVOKE_REASONS = [
  { value: "Unspecified", label: "Unspecified" },
  { value: "Key_Compromise", label: "Key Compromise" },
  { value: "CA_Compromise", label: "CA Compromise" },
  { value: "Affiliation_Changed", label: "Affiliation Changed" },
  { value: "Superseded", label: "Superseded" },
  { value: "Cessation_of_Operation", label: "Cessation of Operation" },
  { value: "Certificate_Hold", label: "Certificate Hold" },
  { value: "Remove_from_CRL", label: "Remove from CRL" },
  { value: "Privilege_Withdrawn", label: "Privilege Withdrawn" },
];

const CertificateDetail: React.FC = () => {
  const { certId } = useParams<{ certId: string }>();
  const navigate = useNavigate();
  const { data: cert, isLoading, error } = useGetAgentCertQuery(certId ?? "");
  const [revokeCert, { isLoading: revoking }] = useRevokeCertMutation();

  const [revokeOpen, setRevokeOpen] = React.useState(false);
  const [revokeReason, setRevokeReason] = React.useState("Unspecified");
  const [result, setResult] = React.useState<{
    success: boolean;
    message: string;
  } | null>(null);

  React.useEffect(() => {
    document.title = `Dogtag PKI - Certificate ${certId ?? ""}`;
  }, [certId]);

  const handleRevoke = async () => {
    if (!cert || cert.Nonce == null) return;
    try {
      await revokeCert({
        certId: cert.id,
        body: { Reason: revokeReason, Nonce: cert.Nonce },
      }).unwrap();
      setResult({
        success: true,
        message: `Certificate ${cert.id} revoked (${revokeReason}).`,
      });
      setRevokeOpen(false);
    } catch (err: unknown) {
      setResult({
        success: false,
        message: extractApiError(err, "Failed to revoke certificate."),
      });
      setRevokeOpen(false);
    }
  };

  return (
    <>
      <PageSection hasBodyWrapper={false} variant={PageSectionVariants.default}>
        <BreadcrumbLayout
          items={[
            { name: "Certificates", url: "/certificates" },
            { name: certId ?? "", url: `/certificates/${certId}` },
          ]}
        />
        <Flex>
          <FlexItem>
            <Content component="h1">Certificate Detail</Content>
          </FlexItem>
          <FlexItem align={{ default: "alignRight" }}>
            <Button variant="link" onClick={() => navigate("/certificates")}>
              Back to list
            </Button>
          </FlexItem>
        </Flex>
      </PageSection>

      <PageSection hasBodyWrapper={false} isFilled={false}>
        {error && (
          <Alert
            variant="danger"
            title="Failed to load certificate details."
            isInline
            className="pf-v6-u-mb-md"
          />
        )}
        {result && (
          <Alert
            variant={result.success ? "success" : "danger"}
            title={result.message}
            isInline
            className="pf-v6-u-mb-md"
          />
        )}
        {isLoading ? (
          <Bullseye>
            <Spinner size="xl" />
          </Bullseye>
        ) : cert ? (
          <Flex
            direction={{ default: "column" }}
            spaceItems={{ default: "spaceItemsLg" }}
          >
            <FlexItem>
              <Card>
                <CardTitle>
                  <Flex>
                    <FlexItem>Certificate Information</FlexItem>
                    <FlexItem align={{ default: "alignRight" }}>
                      {cert.Status === "VALID" && (
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => setRevokeOpen(true)}
                        >
                          Revoke
                        </Button>
                      )}
                    </FlexItem>
                  </Flex>
                </CardTitle>
                <CardBody>
                  <DescriptionList isHorizontal>
                    <DescriptionListGroup>
                      <DescriptionListTerm>Serial Number</DescriptionListTerm>
                      <DescriptionListDescription>
                        {cert.id}
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                    <DescriptionListGroup>
                      <DescriptionListTerm>Status</DescriptionListTerm>
                      <DescriptionListDescription>
                        <StatusLabel status={cert.Status} />
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                    <DescriptionListGroup>
                      <DescriptionListTerm>Subject DN</DescriptionListTerm>
                      <DescriptionListDescription>
                        {cert.SubjectDN}
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                    <DescriptionListGroup>
                      <DescriptionListTerm>Issuer DN</DescriptionListTerm>
                      <DescriptionListDescription>
                        {cert.IssuerDN}
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                    <DescriptionListGroup>
                      <DescriptionListTerm>Not Before</DescriptionListTerm>
                      <DescriptionListDescription>
                        {cert.NotBefore ?? "—"}
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                    <DescriptionListGroup>
                      <DescriptionListTerm>Not After</DescriptionListTerm>
                      <DescriptionListDescription>
                        {cert.NotAfter ?? "—"}
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                    {cert.KeyLength != null && (
                      <DescriptionListGroup>
                        <DescriptionListTerm>Key</DescriptionListTerm>
                        <DescriptionListDescription>
                          <Label isCompact>{cert.KeyLength}-bit</Label>
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                    )}
                  </DescriptionList>
                </CardBody>
              </Card>
            </FlexItem>

            {cert.Encoded && (
              <FlexItem>
                <Card>
                  <CardTitle>PEM Certificate</CardTitle>
                  <CardBody>
                    <ClipboardCopy
                      isCode
                      isReadOnly
                      variant="expansion"
                      hoverTip="Copy PEM"
                      clickTip="Copied"
                    >
                      {cert.Encoded.replace(/\r\n/g, "\n").trim()}
                    </ClipboardCopy>
                  </CardBody>
                </Card>
              </FlexItem>
            )}

            {cert.PrettyPrint && (
              <FlexItem>
                <Card>
                  <CardTitle>Certificate Details</CardTitle>
                  <CardBody>
                    <CodeBlock>
                      <CodeBlockCode>{cert.PrettyPrint}</CodeBlockCode>
                    </CodeBlock>
                  </CardBody>
                </Card>
              </FlexItem>
            )}
          </Flex>
        ) : null}
      </PageSection>

      {revokeOpen && (
        <Modal isOpen onClose={() => setRevokeOpen(false)} variant="small">
          <ModalHeader title="Revoke Certificate" />
          <ModalBody>
            <Content component="p" className="pf-v6-u-mb-md">
              Revoke certificate <strong>{cert?.id}</strong> ({cert?.SubjectDN}
              )? This action cannot be undone.
            </Content>
            <FormGroup label="Revocation Reason" fieldId="revoke-reason">
              <FormSelect
                id="revoke-reason"
                value={revokeReason}
                onChange={(_e, val) => setRevokeReason(val)}
              >
                {REVOKE_REASONS.map((r) => (
                  <FormSelectOption
                    key={r.value}
                    value={r.value}
                    label={r.label}
                  />
                ))}
              </FormSelect>
            </FormGroup>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="danger"
              onClick={handleRevoke}
              isLoading={revoking}
              isDisabled={revoking}
            >
              Revoke
            </Button>
            <Button
              variant="link"
              onClick={() => setRevokeOpen(false)}
              isDisabled={revoking}
            >
              Cancel
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </>
  );
};

export default CertificateDetail;
