import React from "react";
import {
  PageSection,
  PageSectionVariants,
  Content,
  Spinner,
  Bullseye,
} from "@patternfly/react-core";
import { Table, Thead, Tr, Th, Tbody, Td } from "@patternfly/react-table";
import BreadcrumbLayout from "src/components/BreadcrumbLayout";
import { useGetProfilesQuery } from "src/services/dogtagApi";
import ErrorBanner from "src/components/ErrorBanner";

const Profiles: React.FC = () => {
  React.useEffect(() => {
    document.title = "Dogtag PKI - Profiles";
  }, []);

  const { data, isLoading, error } = useGetProfilesQuery();
  const profiles = data?.entries ?? [];

  return (
    <>
      <PageSection hasBodyWrapper={false} variant={PageSectionVariants.default}>
        <BreadcrumbLayout items={[{ name: "Profiles", url: "/profiles" }]} />
        <Content component="h1">Certificate Profiles</Content>
      </PageSection>
      <PageSection hasBodyWrapper={false} isFilled={false}>
        {error && <ErrorBanner message="Failed to load profiles." />}
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
              </Tr>
            </Thead>
            <Tbody>
              {profiles.length === 0 ? (
                <Tr>
                  <Td colSpan={5}>
                    <Content component="small">No profiles found.</Content>
                  </Td>
                </Tr>
              ) : (
                profiles.map((p) => (
                  <Tr key={p.id || p.profileId}>
                    <Td>{p.id || p.profileId}</Td>
                    <Td>{p.name || p.profileName}</Td>
                    <Td>{p.description || p.profileDescription}</Td>
                    <Td>
                      {String(p.enabled ?? p.profileEnabled ?? false) === "true"
                        ? "Yes"
                        : "No"}
                    </Td>
                    <Td>
                      {String(p.visible ?? p.profileVisible ?? false) === "true"
                        ? "Yes"
                        : "No"}
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
