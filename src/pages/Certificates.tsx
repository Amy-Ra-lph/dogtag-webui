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
import { useGetCertificatesQuery } from "src/services/dogtagApi";
import StatusLabel from "src/components/StatusLabel";
import ErrorBanner from "src/components/ErrorBanner";

function formatDate(epoch: number): string {
  return new Date(epoch).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const Certificates: React.FC = () => {
  React.useEffect(() => {
    document.title = "Dogtag PKI - Certificates";
  }, []);

  const { data, isLoading, error } = useGetCertificatesQuery();
  const certs = data?.entries ?? [];

  return (
    <>
      <PageSection hasBodyWrapper={false} variant={PageSectionVariants.default}>
        <BreadcrumbLayout
          items={[{ name: "Certificates", url: "/certificates" }]}
        />
        <Content component="h1">Certificates</Content>
      </PageSection>
      <PageSection hasBodyWrapper={false} isFilled={false}>
        {error && <ErrorBanner message="Failed to load certificates." />}
        {isLoading ? (
          <Bullseye>
            <Spinner size="xl" />
          </Bullseye>
        ) : (
          <Table aria-label="Certificates table">
            <Thead>
              <Tr>
                <Th>Serial Number</Th>
                <Th>Subject DN</Th>
                <Th>Status</Th>
                <Th>Not Valid Before</Th>
                <Th>Not Valid After</Th>
                <Th>Issued By</Th>
              </Tr>
            </Thead>
            <Tbody>
              {certs.length === 0 ? (
                <Tr>
                  <Td colSpan={6}>
                    <Content component="small">No certificates found.</Content>
                  </Td>
                </Tr>
              ) : (
                certs.map((cert) => (
                  <Tr key={cert.id}>
                    <Td>{cert.id}</Td>
                    <Td>{cert.SubjectDN}</Td>
                    <Td>
                      <StatusLabel status={cert.Status} />
                    </Td>
                    <Td>{formatDate(cert.NotValidBefore)}</Td>
                    <Td>{formatDate(cert.NotValidAfter)}</Td>
                    <Td>{cert.IssuedBy}</Td>
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

export default Certificates;
