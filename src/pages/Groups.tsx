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
import { useGetGroupsQuery } from "src/services/dogtagApi";
import ErrorBanner from "src/components/ErrorBanner";

const Groups: React.FC = () => {
  React.useEffect(() => {
    document.title = "Dogtag PKI - Groups";
  }, []);

  const { data, isLoading, error } = useGetGroupsQuery();
  const groups = data?.entries ?? [];

  return (
    <>
      <PageSection hasBodyWrapper={false} variant={PageSectionVariants.default}>
        <BreadcrumbLayout items={[{ name: "Groups", url: "/groups" }]} />
        <Content component="h1">Groups</Content>
      </PageSection>
      <PageSection hasBodyWrapper={false} isFilled={false}>
        {error && <ErrorBanner message="Failed to load groups." />}
        {isLoading ? (
          <Bullseye>
            <Spinner size="xl" />
          </Bullseye>
        ) : (
          <Table aria-label="Groups table">
            <Thead>
              <Tr>
                <Th>Group ID</Th>
                <Th>Description</Th>
              </Tr>
            </Thead>
            <Tbody>
              {groups.length === 0 ? (
                <Tr>
                  <Td colSpan={2}>
                    <Content component="small">No groups found.</Content>
                  </Td>
                </Tr>
              ) : (
                groups.map((g) => (
                  <Tr key={g.id}>
                    <Td>{g.GroupID}</Td>
                    <Td>{g.Description ?? "—"}</Td>
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

export default Groups;
