import React from "react";
import {
  PageSection,
  PageSectionVariants,
  Content,
} from "@patternfly/react-core";
import {
  Table,
  Thead,
  Tr,
  Th,
  Tbody,
  Td,
} from "@patternfly/react-table";
import BreadcrumbLayout from "src/components/BreadcrumbLayout";

const Users: React.FC = () => {
  React.useEffect(() => {
    document.title = "Dogtag PKI - Users";
  }, []);

  return (
    <>
      <PageSection hasBodyWrapper={false} variant={PageSectionVariants.default}>
        <BreadcrumbLayout items={[{ name: "Users", url: "/users" }]} />
        <Content component="h1">Users</Content>
      </PageSection>
      <PageSection hasBodyWrapper={false} isFilled={false}>
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
            <Tr>
              <Td colSpan={5}>
                <Content component="small">
                  No users loaded. Connect to a Dogtag CA instance to view
                  users.
                </Content>
              </Td>
            </Tr>
          </Tbody>
        </Table>
      </PageSection>
    </>
  );
};

export default Users;
