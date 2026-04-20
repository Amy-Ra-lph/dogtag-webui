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

const Profiles: React.FC = () => {
  React.useEffect(() => {
    document.title = "Dogtag PKI - Profiles";
  }, []);

  return (
    <>
      <PageSection hasBodyWrapper={false} variant={PageSectionVariants.default}>
        <BreadcrumbLayout items={[{ name: "Profiles", url: "/profiles" }]} />
        <Content component="h1">Certificate Profiles</Content>
      </PageSection>
      <PageSection hasBodyWrapper={false} isFilled={false}>
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
            <Tr>
              <Td colSpan={5}>
                <Content component="small">
                  No profiles loaded. Connect to a Dogtag CA instance to view
                  profiles.
                </Content>
              </Td>
            </Tr>
          </Tbody>
        </Table>
      </PageSection>
    </>
  );
};

export default Profiles;
