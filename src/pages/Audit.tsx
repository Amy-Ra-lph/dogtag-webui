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

const Audit: React.FC = () => {
  React.useEffect(() => {
    document.title = "Dogtag PKI - Audit";
  }, []);

  return (
    <>
      <PageSection hasBodyWrapper={false} variant={PageSectionVariants.default}>
        <BreadcrumbLayout items={[{ name: "Audit", url: "/audit" }]} />
        <Content component="h1">Audit Log</Content>
      </PageSection>
      <PageSection hasBodyWrapper={false} isFilled={false}>
        <Table aria-label="Audit log table">
          <Thead>
            <Tr>
              <Th>Timestamp</Th>
              <Th>Source</Th>
              <Th>Event</Th>
              <Th>Subject ID</Th>
              <Th>Outcome</Th>
            </Tr>
          </Thead>
          <Tbody>
            <Tr>
              <Td colSpan={5}>
                <Content component="small">
                  No audit events loaded. Connect to a Dogtag CA instance to
                  view the audit log.
                </Content>
              </Td>
            </Tr>
          </Tbody>
        </Table>
      </PageSection>
    </>
  );
};

export default Audit;
