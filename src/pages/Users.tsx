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
import { useGetUsersQuery } from "src/services/dogtagApi";
import ErrorBanner from "src/components/ErrorBanner";

const Users: React.FC = () => {
  React.useEffect(() => {
    document.title = "Dogtag PKI - Users";
  }, []);

  const { data, isLoading, error } = useGetUsersQuery();
  const users = data?.entries ?? [];

  return (
    <>
      <PageSection hasBodyWrapper={false} variant={PageSectionVariants.default}>
        <BreadcrumbLayout items={[{ name: "Users", url: "/users" }]} />
        <Content component="h1">Users</Content>
      </PageSection>
      <PageSection hasBodyWrapper={false} isFilled={false}>
        {error && <ErrorBanner message="Failed to load users." />}
        {isLoading ? (
          <Bullseye>
            <Spinner size="xl" />
          </Bullseye>
        ) : (
          <Table aria-label="Users table">
            <Thead>
              <Tr>
                <Th>User ID</Th>
                <Th>Full Name</Th>
                <Th>Email</Th>
                <Th>State</Th>
                <Th>Type</Th>
              </Tr>
            </Thead>
            <Tbody>
              {users.length === 0 ? (
                <Tr>
                  <Td colSpan={5}>
                    <Content component="small">No users found.</Content>
                  </Td>
                </Tr>
              ) : (
                users.map((u) => (
                  <Tr key={u.id}>
                    <Td>{u.UserID}</Td>
                    <Td>{u.FullName}</Td>
                    <Td>{u.Email ?? "—"}</Td>
                    <Td>{u.State ?? "—"}</Td>
                    <Td>{u.Type ?? "—"}</Td>
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

export default Users;
