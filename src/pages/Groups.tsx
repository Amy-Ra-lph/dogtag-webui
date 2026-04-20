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

const Groups: React.FC = () => {
  React.useEffect(() => {
    document.title = "Dogtag PKI - Groups";
  }, []);

  return (
    <>
      <PageSection hasBodyWrapper={false} variant={PageSectionVariants.default}>
        <BreadcrumbLayout items={[{ name: "Groups", url: "/groups" }]} />
        <Content component="h1">Groups</Content>
      </PageSection>
      <PageSection hasBodyWrapper={false} isFilled={false}>
        <Table aria-label="Groups table">
          <Thead>
            <Tr>
              <Th>Group ID</Th>
              <Th>Description</Th>
            </Tr>
          </Thead>
          <Tbody>
            <Tr>
              <Td colSpan={2}>
                <Content component="small">
                  No groups loaded. Connect to a Dogtag CA instance to view
                  groups.
                </Content>
              </Td>
            </Tr>
          </Tbody>
        </Table>
      </PageSection>
    </>
  );
};

export default Groups;
