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

const Certificates: React.FC = () => {
  React.useEffect(() => {
    document.title = "Dogtag PKI - Certificates";
  }, []);

  return (
    <>
      <PageSection hasBodyWrapper={false} variant={PageSectionVariants.default}>
        <BreadcrumbLayout items={[{ name: "Certificates", url: "/certificates" }]} />
        <Content component="h1">Certificates</Content>
      </PageSection>
      <PageSection hasBodyWrapper={false} isFilled={false}>
        <Table aria-label="Certificates table">
          <Thead>
            <Tr>
              <Th>Serial Number</Th>
              <Th>Subject DN</Th>
              <Th>Issuer DN</Th>
              <Th>Status</Th>
              <Th>Not Valid Before</Th>
              <Th>Not Valid After</Th>
            </Tr>
          </Thead>
          <Tbody>
            <Tr>
              <Td colSpan={6}>
                <Content component="small">
                  No certificates loaded. Connect to a Dogtag CA instance to
                  view certificates.
                </Content>
              </Td>
            </Tr>
          </Tbody>
        </Table>
      </PageSection>
    </>
  );
};

export default Certificates;
