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

const Authorities: React.FC = () => {
  React.useEffect(() => {
    document.title = "Dogtag PKI - Authorities";
  }, []);

  return (
    <>
      <PageSection hasBodyWrapper={false} variant={PageSectionVariants.default}>
        <BreadcrumbLayout
          items={[{ name: "Authorities", url: "/authorities" }]}
        />
        <Content component="h1">Certificate Authorities</Content>
      </PageSection>
      <PageSection hasBodyWrapper={false} isFilled={false}>
        <Table aria-label="Authorities table">
          <Thead>
            <Tr>
              <Th>Authority ID</Th>
              <Th>DN</Th>
              <Th>Issuer DN</Th>
              <Th>Enabled</Th>
              <Th>Description</Th>
            </Tr>
          </Thead>
          <Tbody>
            <Tr>
              <Td colSpan={5}>
                <Content component="small">
                  No authorities loaded. Connect to a Dogtag CA instance to view
                  lightweight CAs.
                </Content>
              </Td>
            </Tr>
          </Tbody>
        </Table>
      </PageSection>
    </>
  );
};

export default Authorities;
