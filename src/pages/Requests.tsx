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

const Requests: React.FC = () => {
  React.useEffect(() => {
    document.title = "Dogtag PKI - Requests";
  }, []);

  return (
    <>
      <PageSection hasBodyWrapper={false} variant={PageSectionVariants.default}>
        <BreadcrumbLayout items={[{ name: "Requests", url: "/requests" }]} />
        <Content component="h1">Certificate Requests</Content>
      </PageSection>
      <PageSection hasBodyWrapper={false} isFilled={false}>
        <Table aria-label="Certificate requests table">
          <Thead>
            <Tr>
              <Th>Request ID</Th>
              <Th>Type</Th>
              <Th>Status</Th>
              <Th>Certificate ID</Th>
              <Th>Operation Result</Th>
            </Tr>
          </Thead>
          <Tbody>
            <Tr>
              <Td colSpan={5}>
                <Content component="small">
                  No certificate requests loaded. Connect to a Dogtag CA
                  instance to view requests.
                </Content>
              </Td>
            </Tr>
          </Tbody>
        </Table>
      </PageSection>
    </>
  );
};

export default Requests;
