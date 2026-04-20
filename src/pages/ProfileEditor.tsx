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
  TextInput,
  TextArea,
  ActionGroup,
  Button,
  Alert,
  Spinner,
  Bullseye,
  Flex,
  FlexItem,
  Switch,
  ExpandableSection,
  Label,
  DescriptionList,
  DescriptionListGroup,
  DescriptionListTerm,
  DescriptionListDescription,
} from "@patternfly/react-core";
import { Table, Thead, Tr, Th, Tbody, Td } from "@patternfly/react-table";
import BreadcrumbLayout from "src/components/BreadcrumbLayout";
import {
  useGetProfileDetailQuery,
  useCreateProfileMutation,
  type ProfileDetail,
  type ProfilePolicy,
} from "src/services/dogtagApi";

const SOURCE_PROFILES = [
  { id: "caUserCert", label: "User Certificate" },
  { id: "caServerCert", label: "Server Certificate" },
  { id: "caCACert", label: "Sub-CA Certificate" },
  { id: "caECUserCert", label: "EC User Certificate" },
  { id: "caECServerCert", label: "EC Server Certificate" },
  { id: "caSignedLogCert", label: "Signed Log Certificate" },
  { id: "caUserSMIMEcapCert", label: "User S/MIME Certificate" },
  { id: "caAdminCert", label: "Admin Certificate" },
];

const ProfileEditor: React.FC = () => {
  React.useEffect(() => {
    document.title = "Dogtag PKI - Profile Editor";
  }, []);

  const [sourceId, setSourceId] = React.useState("caServerCert");
  const [newId, setNewId] = React.useState("");
  const [newName, setNewName] = React.useState("");
  const [newDesc, setNewDesc] = React.useState("");
  const [newVisible, setNewVisible] = React.useState(true);
  const [policyEdits, setPolicyEdits] = React.useState<
    Record<string, Record<string, string>>
  >({});
  const [constraintEdits, setConstraintEdits] = React.useState<
    Record<string, Record<string, string>>
  >({});
  const [result, setResult] = React.useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const {
    data: sourceProfile,
    isLoading,
    error: loadError,
  } = useGetProfileDetailQuery(sourceId);

  const [createProfile, { isLoading: creating }] = useCreateProfileMutation();

  React.useEffect(() => {
    setPolicyEdits({});
    setConstraintEdits({});
    setResult(null);
    if (sourceProfile) {
      setNewName(sourceProfile.name ? `Custom ${sourceProfile.name}` : "");
      setNewDesc(sourceProfile.description ?? "");
    }
  }, [sourceProfile]);

  const getPolicyValue = (
    policyId: string,
    attrName: string,
    original: string,
  ) => policyEdits[policyId]?.[attrName] ?? original;

  const getConstraintValue = (
    policyId: string,
    cName: string,
    original: string,
  ) => constraintEdits[policyId]?.[cName] ?? original;

  const handlePolicyEdit = (
    policyId: string,
    attrName: string,
    value: string,
  ) => {
    setPolicyEdits((prev) => ({
      ...prev,
      [policyId]: { ...prev[policyId], [attrName]: value },
    }));
  };

  const handleConstraintEdit = (
    policyId: string,
    cName: string,
    value: string,
  ) => {
    setConstraintEdits((prev) => ({
      ...prev,
      [policyId]: { ...prev[policyId], [cName]: value },
    }));
  };

  const buildProfile = (): ProfileDetail | null => {
    if (!sourceProfile || !newId.trim()) return null;

    const policySets: Record<string, ProfilePolicy[]> = {};
    for (const [setId, policies] of Object.entries(
      sourceProfile.policySets ?? {},
    )) {
      policySets[setId] = policies.map((p) => ({
        id: p.id,
        def: {
          ...p.def,
          params: p.def.params?.map((param) => ({
            ...param,
            value: getPolicyValue(p.id, param.name, param.value),
          })),
        },
        constraint: {
          ...p.constraint,
          constraints: p.constraint.constraints?.map((c) => ({
            ...c,
            value: getConstraintValue(p.id, c.name, c.value),
          })),
        },
      }));
    }

    return {
      id: newId.trim(),
      classId: sourceProfile.classId,
      name: newName.trim(),
      description: newDesc.trim(),
      enabled: false,
      visible: newVisible,
      authenticatorId: sourceProfile.authenticatorId,
      authzAcl: sourceProfile.authzAcl ?? "",
      renewal: sourceProfile.renewal ?? false,
      xmlOutput: sourceProfile.xmlOutput ?? false,
      inputs: sourceProfile.inputs ?? [],
      outputs: sourceProfile.outputs ?? [],
      policySets,
    };
  };

  const handleCreate = async () => {
    const profile = buildProfile();
    if (!profile) return;
    setResult(null);

    try {
      await createProfile(profile).unwrap();
      setResult({
        success: true,
        message: `Profile "${profile.id}" created successfully. Enable it from the Profiles page to start using it.`,
      });
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "data" in err
          ? JSON.stringify((err as { data: unknown }).data)
          : "Failed to create profile.";
      setResult({ success: false, message: msg });
    }
  };

  const allPolicies: (ProfilePolicy & { setId: string })[] = [];
  if (sourceProfile?.policySets) {
    for (const [setId, policies] of Object.entries(sourceProfile.policySets)) {
      for (const p of policies) {
        allPolicies.push({ ...p, setId });
      }
    }
  }

  return (
    <>
      <PageSection hasBodyWrapper={false} variant={PageSectionVariants.default}>
        <BreadcrumbLayout
          items={[
            { name: "Profiles", url: "/profiles" },
            { name: "Create Profile", url: "/profiles/create" },
          ]}
        />
        <Content component="h1">Create Certificate Profile</Content>
        <Content component="p">
          Clone an existing profile and customize its policies and constraints.
        </Content>
      </PageSection>
      <PageSection hasBodyWrapper={false} isFilled={false}>
        <Flex
          direction={{ default: "column" }}
          spaceItems={{ default: "spaceItemsLg" }}
        >
          {/* Source profile selection */}
          <FlexItem>
            <Card>
              <CardTitle>Source Profile</CardTitle>
              <CardBody>
                <FormGroup
                  label="Clone from existing profile"
                  fieldId="source-profile"
                >
                  <FormSelect
                    id="source-profile"
                    value={sourceId}
                    onChange={(_e, val) => setSourceId(val)}
                  >
                    {SOURCE_PROFILES.map((p) => (
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

          {loadError && (
            <FlexItem>
              <Alert
                variant="danger"
                title="Failed to load source profile. Profile management requires admin authentication configured in Dogtag."
                isInline
              />
            </FlexItem>
          )}

          {isLoading ? (
            <FlexItem>
              <Bullseye>
                <Spinner size="xl" />
              </Bullseye>
            </FlexItem>
          ) : sourceProfile ? (
            <>
              {/* New profile metadata */}
              <FlexItem>
                <Card>
                  <CardTitle>New Profile Settings</CardTitle>
                  <CardBody>
                    <Form>
                      <FormGroup label="Profile ID" fieldId="new-id" isRequired>
                        <TextInput
                          id="new-id"
                          value={newId}
                          onChange={(_e, val) => setNewId(val)}
                          placeholder="myCustomProfile"
                        />
                      </FormGroup>
                      <FormGroup label="Display Name" fieldId="new-name">
                        <TextInput
                          id="new-name"
                          value={newName}
                          onChange={(_e, val) => setNewName(val)}
                        />
                      </FormGroup>
                      <FormGroup label="Description" fieldId="new-desc">
                        <TextArea
                          id="new-desc"
                          value={newDesc}
                          onChange={(_e, val) => setNewDesc(val)}
                          rows={3}
                        />
                      </FormGroup>
                      <FormGroup label="Visible" fieldId="new-visible">
                        <Switch
                          id="new-visible"
                          isChecked={newVisible}
                          onChange={(_e, val) => setNewVisible(val)}
                          label="Visible to end users"
                        />
                      </FormGroup>
                    </Form>
                  </CardBody>
                </Card>
              </FlexItem>

              {/* Source profile info */}
              <FlexItem>
                <Card>
                  <CardTitle>
                    Source Profile: {sourceProfile.name ?? sourceId}
                  </CardTitle>
                  <CardBody>
                    <DescriptionList isHorizontal isCompact>
                      <DescriptionListGroup>
                        <DescriptionListTerm>Class</DescriptionListTerm>
                        <DescriptionListDescription>
                          {sourceProfile.classId}
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                      <DescriptionListGroup>
                        <DescriptionListTerm>Inputs</DescriptionListTerm>
                        <DescriptionListDescription>
                          {sourceProfile.inputs?.length ?? 0} input(s)
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                      <DescriptionListGroup>
                        <DescriptionListTerm>Policies</DescriptionListTerm>
                        <DescriptionListDescription>
                          {allPolicies.length} policy rule(s)
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                    </DescriptionList>
                  </CardBody>
                </Card>
              </FlexItem>

              {/* Policy editor */}
              <FlexItem>
                <Card>
                  <CardTitle>Profile Policies</CardTitle>
                  <CardBody>
                    {allPolicies.map((policy) => (
                      <ExpandableSection
                        key={policy.id}
                        toggleText={`${policy.def?.name ?? `Policy ${policy.id}`} — ${policy.def?.text ?? ""}`}
                        className="pf-v6-u-mb-md"
                      >
                        {/* Default params */}
                        {policy.def?.params && policy.def.params.length > 0 && (
                          <>
                            <Content component="h5" className="pf-v6-u-mb-sm">
                              Default Parameters
                            </Content>
                            <Table
                              aria-label={`Policy ${policy.id} defaults`}
                              variant="compact"
                            >
                              <Thead>
                                <Tr>
                                  <Th>Parameter</Th>
                                  <Th>Value</Th>
                                </Tr>
                              </Thead>
                              <Tbody>
                                {policy.def.params.map((param) => (
                                  <Tr key={param.name}>
                                    <Td>
                                      <Label isCompact>{param.name}</Label>
                                    </Td>
                                    <Td>
                                      <TextInput
                                        value={getPolicyValue(
                                          policy.id,
                                          param.name,
                                          param.value,
                                        )}
                                        onChange={(_e, val) =>
                                          handlePolicyEdit(
                                            policy.id,
                                            param.name,
                                            val,
                                          )
                                        }
                                        aria-label={param.name}
                                      />
                                    </Td>
                                  </Tr>
                                ))}
                              </Tbody>
                            </Table>
                          </>
                        )}

                        {/* Constraint params */}
                        {policy.constraint?.constraints &&
                          policy.constraint.constraints.length > 0 && (
                            <>
                              <Content
                                component="h5"
                                className="pf-v6-u-mt-md pf-v6-u-mb-sm"
                              >
                                Constraints ({policy.constraint.name})
                              </Content>
                              <Table
                                aria-label={`Policy ${policy.id} constraints`}
                                variant="compact"
                              >
                                <Thead>
                                  <Tr>
                                    <Th>Constraint</Th>
                                    <Th>Value</Th>
                                  </Tr>
                                </Thead>
                                <Tbody>
                                  {policy.constraint.constraints.map((c) => (
                                    <Tr key={c.name}>
                                      <Td>
                                        <Label isCompact>{c.name}</Label>
                                      </Td>
                                      <Td>
                                        <TextInput
                                          value={getConstraintValue(
                                            policy.id,
                                            c.name,
                                            c.value,
                                          )}
                                          onChange={(_e, val) =>
                                            handleConstraintEdit(
                                              policy.id,
                                              c.name,
                                              val,
                                            )
                                          }
                                          aria-label={c.name}
                                        />
                                      </Td>
                                    </Tr>
                                  ))}
                                </Tbody>
                              </Table>
                            </>
                          )}
                      </ExpandableSection>
                    ))}
                  </CardBody>
                </Card>
              </FlexItem>

              {/* Actions */}
              <FlexItem>
                <ActionGroup>
                  <Button
                    variant="primary"
                    onClick={handleCreate}
                    isLoading={creating}
                    isDisabled={creating || !newId.trim()}
                  >
                    Create Profile
                  </Button>
                </ActionGroup>
              </FlexItem>
            </>
          ) : null}

          {result && (
            <FlexItem>
              <Alert
                variant={result.success ? "success" : "danger"}
                title={result.message}
                isInline
              />
            </FlexItem>
          )}
        </Flex>
      </PageSection>
    </>
  );
};

export default ProfileEditor;
