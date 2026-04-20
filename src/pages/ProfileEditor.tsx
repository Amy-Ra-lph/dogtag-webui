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
import { useParams } from "react-router";
import BreadcrumbLayout from "src/components/BreadcrumbLayout";
import {
  useGetProfilesQuery,
  useGetProfileDetailQuery,
  useCreateProfileMutation,
  useModifyProfileMutation,
  extractApiError,
  type ProfileDetail,
  type ProfilePolicy,
} from "src/services/dogtagApi";

const ProfileEditor: React.FC = () => {
  const { profileId: editId } = useParams<{ profileId: string }>();
  const isEditMode = !!editId;

  React.useEffect(() => {
    document.title = isEditMode
      ? `Dogtag PKI - Edit Profile ${editId}`
      : "Dogtag PKI - Create Profile";
  }, [isEditMode, editId]);

  const { data: profileList } = useGetProfilesQuery();
  const sourceProfiles = (profileList?.entries ?? []).filter(
    (p) => String(p.enabled ?? p.profileEnabled ?? false) === "true",
  );

  const [sourceId, setSourceId] = React.useState("caServerCert");
  const activeId = isEditMode ? editId! : sourceId;

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
  } = useGetProfileDetailQuery(activeId);

  const [createProfile, { isLoading: creating }] = useCreateProfileMutation();
  const [modifyProfile, { isLoading: saving }] = useModifyProfileMutation();

  React.useEffect(() => {
    setPolicyEdits({});
    setConstraintEdits({});
    setResult(null);
    if (sourceProfile) {
      if (isEditMode) {
        setNewId(sourceProfile.id);
        setNewName(sourceProfile.name ?? "");
      } else {
        setNewName(sourceProfile.name ? `Custom ${sourceProfile.name}` : "");
      }
      setNewDesc(sourceProfile.description ?? "");
      setNewVisible(sourceProfile.visible ?? true);
    }
  }, [sourceProfile, isEditMode]);

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
      enabled: isEditMode ? sourceProfile.enabled : false,
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

  const handleSubmit = async () => {
    const profile = buildProfile();
    if (!profile) return;
    setResult(null);

    try {
      if (isEditMode) {
        await modifyProfile({
          profileId: profile.id,
          body: profile,
        }).unwrap();
        setResult({
          success: true,
          message: `Profile "${profile.id}" updated successfully.`,
        });
      } else {
        await createProfile(profile).unwrap();
        setResult({
          success: true,
          message: `Profile "${profile.id}" created successfully. Enable it from the Profiles page to start using it.`,
        });
      }
    } catch (err: unknown) {
      setResult({
        success: false,
        message: extractApiError(
          err,
          `Failed to ${isEditMode ? "update" : "create"} profile.`,
        ),
      });
    }
  };

  const busy = creating || saving;

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
            {
              name: isEditMode ? `Edit ${editId}` : "Create Profile",
              url: isEditMode ? `/profiles/edit/${editId}` : "/profiles/create",
            },
          ]}
        />
        <Content component="h1">
          {isEditMode
            ? `Edit Profile: ${editId}`
            : "Create Certificate Profile"}
        </Content>
        <Content component="p">
          {isEditMode
            ? "Modify this profile's metadata and policy parameters."
            : "Clone an existing profile and customize its policies and constraints."}
        </Content>
      </PageSection>
      <PageSection hasBodyWrapper={false} isFilled={false}>
        <Flex
          direction={{ default: "column" }}
          spaceItems={{ default: "spaceItemsLg" }}
        >
          {!isEditMode && (
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
                      {sourceProfiles.map((p) => {
                        const id = p.id || p.profileId || "";
                        const name = p.name || p.profileName || id;
                        return (
                          <FormSelectOption
                            key={id}
                            value={id}
                            label={`${name} (${id})`}
                          />
                        );
                      })}
                    </FormSelect>
                  </FormGroup>
                </CardBody>
              </Card>
            </FlexItem>
          )}

          {loadError && (
            <FlexItem>
              <Alert
                variant="danger"
                title="Failed to load profile. Profile management requires admin authentication."
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
              <FlexItem>
                <Card>
                  <CardTitle>Profile Settings</CardTitle>
                  <CardBody>
                    <Form>
                      <FormGroup label="Profile ID" fieldId="new-id" isRequired>
                        <TextInput
                          id="new-id"
                          value={newId}
                          onChange={(_e, val) => setNewId(val)}
                          placeholder="myCustomProfile"
                          isDisabled={isEditMode}
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

              {!isEditMode && (
                <FlexItem>
                  <Card>
                    <CardTitle>
                      Source Profile: {sourceProfile.name ?? activeId}
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
              )}

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

              <FlexItem>
                <ActionGroup>
                  <Button
                    variant="primary"
                    onClick={handleSubmit}
                    isLoading={busy}
                    isDisabled={busy || !newId.trim()}
                  >
                    {isEditMode ? "Save Changes" : "Create Profile"}
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
