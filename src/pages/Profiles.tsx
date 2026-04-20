import React from "react";
import {
  PageSection,
  PageSectionVariants,
  Content,
  Spinner,
  Bullseye,
  Button,
  Label,
  Alert,
  Flex,
  FlexItem,
} from "@patternfly/react-core";
import { Table, Thead, Tr, Th, Tbody, Td } from "@patternfly/react-table";
import { useNavigate } from "react-router";
import BreadcrumbLayout from "src/components/BreadcrumbLayout";
import {
  useGetProfilesQuery,
  useEnableProfileMutation,
  useDisableProfileMutation,
  useDeleteProfileMutation,
} from "src/services/dogtagApi";
import ErrorBanner from "src/components/ErrorBanner";

const Profiles: React.FC = () => {
  React.useEffect(() => {
    document.title = "Dogtag PKI - Profiles";
  }, []);

  const navigate = useNavigate();
  const { data, isLoading, error } = useGetProfilesQuery();
  const [enableProfile] = useEnableProfileMutation();
  const [disableProfile] = useDisableProfileMutation();
  const [deleteProfile] = useDeleteProfileMutation();
  const [actionResult, setActionResult] = React.useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const profiles = data?.entries ?? [];

  const getId = (p: (typeof profiles)[0]) => p.id || p.profileId || "";
  const isEnabled = (p: (typeof profiles)[0]) =>
    String(p.enabled ?? p.profileEnabled ?? false) === "true";

  const handleToggle = async (p: (typeof profiles)[0]) => {
    const id = getId(p);
    try {
      if (isEnabled(p)) {
        await disableProfile(id).unwrap();
        setActionResult({
          success: true,
          message: `Profile "${id}" disabled.`,
        });
      } else {
        await enableProfile(id).unwrap();
        setActionResult({ success: true, message: `Profile "${id}" enabled.` });
      }
    } catch {
      setActionResult({
        success: false,
        message: `Failed to ${isEnabled(p) ? "disable" : "enable"} profile "${id}".`,
      });
    }
  };

  const handleDelete = async (p: (typeof profiles)[0]) => {
    const id = getId(p);
    if (isEnabled(p)) {
      setActionResult({
        success: false,
        message: `Disable profile "${id}" before deleting.`,
      });
      return;
    }
    try {
      await deleteProfile(id).unwrap();
      setActionResult({
        success: true,
        message: `Profile "${id}" deleted.`,
      });
    } catch {
      setActionResult({
        success: false,
        message: `Failed to delete profile "${id}".`,
      });
    }
  };

  return (
    <>
      <PageSection hasBodyWrapper={false} variant={PageSectionVariants.default}>
        <BreadcrumbLayout items={[{ name: "Profiles", url: "/profiles" }]} />
        <Flex>
          <FlexItem>
            <Content component="h1">Certificate Profiles</Content>
          </FlexItem>
          <FlexItem align={{ default: "alignRight" }}>
            <Button
              variant="primary"
              onClick={() => navigate("/profiles/create")}
            >
              Create Profile
            </Button>
          </FlexItem>
        </Flex>
      </PageSection>
      <PageSection hasBodyWrapper={false} isFilled={false}>
        {error && <ErrorBanner message="Failed to load profiles." />}
        {actionResult && (
          <Alert
            variant={actionResult.success ? "success" : "danger"}
            title={actionResult.message}
            isInline
            className="pf-v6-u-mb-md"
            actionClose={
              <Button variant="plain" onClick={() => setActionResult(null)}>
                ✕
              </Button>
            }
          />
        )}
        {isLoading ? (
          <Bullseye>
            <Spinner size="xl" />
          </Bullseye>
        ) : (
          <Table aria-label="Profiles table">
            <Thead>
              <Tr>
                <Th>Profile ID</Th>
                <Th>Name</Th>
                <Th>Description</Th>
                <Th>Enabled</Th>
                <Th>Visible</Th>
                <Th>Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {profiles.length === 0 ? (
                <Tr>
                  <Td colSpan={6}>
                    <Content component="small">No profiles found.</Content>
                  </Td>
                </Tr>
              ) : (
                profiles.map((p) => (
                  <Tr key={getId(p)}>
                    <Td>{getId(p)}</Td>
                    <Td>{p.name || p.profileName}</Td>
                    <Td>{p.description || p.profileDescription}</Td>
                    <Td>
                      <Label color={isEnabled(p) ? "green" : "grey"}>
                        {isEnabled(p) ? "Enabled" : "Disabled"}
                      </Label>
                    </Td>
                    <Td>
                      {String(p.visible ?? p.profileVisible ?? false) ===
                      "true" ? (
                        <Label color="blue" isCompact>
                          Visible
                        </Label>
                      ) : (
                        <Label isCompact>Hidden</Label>
                      )}
                    </Td>
                    <Td>
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() =>
                          navigate(
                            `/profiles/edit/${encodeURIComponent(getId(p))}`,
                          )
                        }
                        isDisabled={isEnabled(p)}
                        className="pf-v6-u-mr-sm"
                      >
                        Edit
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleToggle(p)}
                        className="pf-v6-u-mr-sm"
                      >
                        {isEnabled(p) ? "Disable" : "Enable"}
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDelete(p)}
                        isDisabled={isEnabled(p)}
                      >
                        Delete
                      </Button>
                    </Td>
                  </Tr>
                ))
              )}
            </Tbody>
          </Table>
        )}
      </PageSection>
    </>
  );
};

export default Profiles;
