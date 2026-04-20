import React from "react";
import {
  PageSection,
  PageSectionVariants,
  Content,
  Card,
  CardTitle,
  CardBody,
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
  TextArea,
  TextInput,
  ActionGroup,
  Button,
  Alert,
  Spinner,
  Bullseye,
  DescriptionList,
  DescriptionListGroup,
  DescriptionListTerm,
  DescriptionListDescription,
  Label,
  Flex,
  FlexItem,
} from "@patternfly/react-core";
import BreadcrumbLayout from "src/components/BreadcrumbLayout";
import {
  useGetEnrollmentTemplateQuery,
  useEnrollCertificateMutation,
  extractApiError,
  type EnrollmentRequest,
} from "src/services/dogtagApi";

const PROFILES = [
  { id: "caUserCert", label: "User Certificate" },
  { id: "caServerCert", label: "Server Certificate (Manual)" },
  { id: "caSignedLogCert", label: "Signed Log Certificate" },
  { id: "caCACert", label: "Sub-CA Certificate" },
  { id: "caECUserCert", label: "EC User Certificate" },
  { id: "caECServerCert", label: "EC Server Certificate" },
  { id: "caUserSMIMEcapCert", label: "User S/MIME Certificate" },
  { id: "caOtherCert", label: "Other Certificate" },
  { id: "caAdminCert", label: "Admin Certificate" },
  { id: "caAgentServerCert", label: "Agent Server Certificate" },
];

const Enroll: React.FC = () => {
  React.useEffect(() => {
    document.title = "Dogtag PKI - Enroll Certificate";
  }, []);

  const [profileId, setProfileId] = React.useState("caUserCert");
  const [formValues, setFormValues] = React.useState<Record<string, string>>(
    {},
  );
  const [submitResult, setSubmitResult] = React.useState<{
    success: boolean;
    message: string;
    requestId?: string;
    certId?: string;
  } | null>(null);

  const {
    data: template,
    isLoading: templateLoading,
    error: templateError,
  } = useGetEnrollmentTemplateQuery(profileId);

  const [enrollCertificate, { isLoading: enrolling }] =
    useEnrollCertificateMutation();

  React.useEffect(() => {
    setFormValues({ cert_request_type: "pkcs10" });
    setSubmitResult(null);
  }, [profileId]);

  const handleFieldChange = (name: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async () => {
    if (!template) return;
    setSubmitResult(null);

    const request: EnrollmentRequest = {
      ProfileID: template.ProfileID,
      Renewal: false,
      Input: template.Input.map((input) => ({
        id: input.id,
        ClassID: input.ClassID,
        Name: input.Name,
        Attribute: input.Attribute.map((attr) => ({
          name: attr.name,
          Value: formValues[attr.name] ?? "",
        })),
      })),
    };

    try {
      const result = await enrollCertificate(request).unwrap();
      const entry = result?.entries?.[0];
      if (entry?.requestStatus === "complete" && entry.certId) {
        setSubmitResult({
          success: true,
          message: `Certificate issued successfully.`,
          requestId: entry.requestID,
          certId: entry.certId,
        });
      } else if (entry?.requestStatus === "pending") {
        setSubmitResult({
          success: true,
          message: `Request submitted and pending agent approval.`,
          requestId: entry.requestID,
        });
      } else if (entry?.operationResult === "success") {
        setSubmitResult({
          success: true,
          message: `Request submitted successfully.`,
          requestId: entry.requestID,
          certId: entry.certId,
        });
      } else {
        setSubmitResult({
          success: false,
          message: entry?.errorMessage ?? "Unknown error occurred.",
          requestId: entry?.requestID,
        });
      }
    } catch (err: unknown) {
      setSubmitResult({
        success: false,
        message: extractApiError(err, "Failed to submit enrollment request."),
      });
    }
  };

  const isCsrField = (name: string) =>
    name === "cert_request" || name === "cert_request_type";

  return (
    <>
      <PageSection hasBodyWrapper={false} variant={PageSectionVariants.default}>
        <BreadcrumbLayout items={[{ name: "Enroll", url: "/enroll" }]} />
        <Content component="h1">Certificate Enrollment</Content>
        <Content component="p">
          Submit a certificate signing request against a Dogtag certificate
          profile.
        </Content>
      </PageSection>
      <PageSection hasBodyWrapper={false} isFilled={false}>
        <Flex
          direction={{ default: "column" }}
          spaceItems={{ default: "spaceItemsLg" }}
        >
          <FlexItem>
            <Card>
              <CardTitle>Profile Selection</CardTitle>
              <CardBody>
                <FormGroup label="Certificate Profile" fieldId="profile-select">
                  <FormSelect
                    id="profile-select"
                    value={profileId}
                    onChange={(_e, val) => setProfileId(val)}
                  >
                    {PROFILES.map((p) => (
                      <FormSelectOption
                        key={p.id}
                        value={p.id}
                        label={`${p.label} (${p.id})`}
                      />
                    ))}
                  </FormSelect>
                </FormGroup>
              </CardBody>
            </Card>
          </FlexItem>

          {templateError && (
            <FlexItem>
              <Alert
                variant="danger"
                title="Failed to load enrollment template."
                isInline
              />
            </FlexItem>
          )}

          {templateLoading ? (
            <FlexItem>
              <Bullseye>
                <Spinner size="xl" />
              </Bullseye>
            </FlexItem>
          ) : template ? (
            <FlexItem>
              <Card>
                <CardTitle>Enrollment Form</CardTitle>
                <CardBody>
                  <Form>
                    {template.Input.map((input) => (
                      <React.Fragment key={input.id}>
                        <Content component="h4" className="pf-v6-u-mt-md">
                          {input.Name}
                        </Content>
                        {input.Attribute.map((attr) => (
                          <FormGroup
                            key={attr.name}
                            label={attr.Descriptor?.Description ?? attr.name}
                            fieldId={attr.name}
                            isRequired={isCsrField(attr.name)}
                          >
                            {attr.name === "cert_request" ? (
                              <TextArea
                                id={attr.name}
                                value={formValues[attr.name] ?? ""}
                                onChange={(_e, val) =>
                                  handleFieldChange(attr.name, val)
                                }
                                placeholder="-----BEGIN CERTIFICATE REQUEST-----&#10;...&#10;-----END CERTIFICATE REQUEST-----"
                                rows={8}
                                resizeOrientation="vertical"
                              />
                            ) : attr.name === "cert_request_type" ? (
                              <FormSelect
                                id={attr.name}
                                value={formValues[attr.name] ?? "pkcs10"}
                                onChange={(_e, val) =>
                                  handleFieldChange(attr.name, val)
                                }
                              >
                                <FormSelectOption
                                  value="pkcs10"
                                  label="PKCS#10"
                                />
                                <FormSelectOption value="crmf" label="CRMF" />
                              </FormSelect>
                            ) : (
                              <TextInput
                                id={attr.name}
                                value={formValues[attr.name] ?? ""}
                                onChange={(_e, val) =>
                                  handleFieldChange(attr.name, val)
                                }
                              />
                            )}
                          </FormGroup>
                        ))}
                      </React.Fragment>
                    ))}
                    <ActionGroup className="pf-v6-u-mt-lg">
                      <Button
                        variant="primary"
                        onClick={handleSubmit}
                        isLoading={enrolling}
                        isDisabled={
                          enrolling || !formValues["cert_request"]?.trim()
                        }
                      >
                        Submit Enrollment
                      </Button>
                    </ActionGroup>
                  </Form>
                </CardBody>
              </Card>
            </FlexItem>
          ) : null}

          {submitResult && (
            <FlexItem>
              <Alert
                variant={submitResult.success ? "success" : "danger"}
                title={submitResult.message}
                isInline
              >
                {(submitResult.requestId || submitResult.certId) && (
                  <DescriptionList isCompact isHorizontal>
                    {submitResult.requestId && (
                      <DescriptionListGroup>
                        <DescriptionListTerm>Request ID</DescriptionListTerm>
                        <DescriptionListDescription>
                          <Label isCompact>{submitResult.requestId}</Label>
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                    )}
                    {submitResult.certId && (
                      <DescriptionListGroup>
                        <DescriptionListTerm>
                          Certificate ID
                        </DescriptionListTerm>
                        <DescriptionListDescription>
                          <Label color="green" isCompact>
                            {submitResult.certId}
                          </Label>
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                    )}
                  </DescriptionList>
                )}
              </Alert>
            </FlexItem>
          )}
        </Flex>
      </PageSection>
    </>
  );
};

export default Enroll;
