import React from "react";
import {
  PageSection,
  PageSectionVariants,
  Content,
  Spinner,
  Bullseye,
  Label,
} from "@patternfly/react-core";
import { Table, Thead, Tr, Th, Tbody, Td } from "@patternfly/react-table";
import BreadcrumbLayout from "src/components/BreadcrumbLayout";
import { useGetAuthoritiesQuery } from "src/services/dogtagApi";
import ErrorBanner from "src/components/ErrorBanner";

const Authorities: React.FC = () => {
  React.useEffect(() => {
    document.title = "Dogtag PKI - Authorities";
  }, []);

  const { data: authorities = [], isLoading, error } = useGetAuthoritiesQuery();

  return (
    <>
      <PageSection hasBodyWrapper={false} variant={PageSectionVariants.default}>
        <BreadcrumbLayout
          items={[{ name: "Authorities", url: "/authorities" }]}
        />
        <Content component="h1">Certificate Authorities</Content>
      </PageSection>
      <PageSection hasBodyWrapper={false} isFilled={false}>
        {error && <ErrorBanner message="Failed to load authorities." />}
        {isLoading ? (
          <Bullseye>
            <Spinner size="xl" />
          </Bullseye>
        ) : (
          <Table aria-label="Authorities table">
            <Thead>
              <Tr>
                <Th>DN</Th>
                <Th>Issuer DN</Th>
                <Th>Enabled</Th>
                <Th>Host CA</Th>
                <Th>Description</Th>
              </Tr>
            </Thead>
            <Tbody>
              {authorities.length === 0 ? (
                <Tr>
                  <Td colSpan={5}>
                    <Content component="small">No authorities found.</Content>
                  </Td>
                </Tr>
              ) : (
                authorities.map((a) => (
                  <Tr key={a.id}>
                    <Td>{a.dn}</Td>
                    <Td>{a.issuerDN ?? "—"}</Td>
                    <Td>
                      <Label color={a.enabled ? "green" : "red"}>
                        {a.enabled ? "Yes" : "No"}
                      </Label>
                    </Td>
                    <Td>{a.isHostAuthority ? "Yes" : "No"}</Td>
                    <Td>{a.description ?? "—"}</Td>
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

export default Authorities;
