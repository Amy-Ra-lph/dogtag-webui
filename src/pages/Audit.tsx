import React from "react";
import {
  PageSection,
  PageSectionVariants,
  Content,
  Spinner,
  Bullseye,
  Card,
  CardTitle,
  CardBody,
  DescriptionList,
  DescriptionListGroup,
  DescriptionListTerm,
  DescriptionListDescription,
  Label,
  Flex,
  FlexItem,
} from "@patternfly/react-core";
import { Table, Thead, Tr, Th, Tbody, Td } from "@patternfly/react-table";
import BreadcrumbLayout from "src/components/BreadcrumbLayout";
import { useGetAuditConfigQuery } from "src/services/dogtagApi";
import ErrorBanner from "src/components/ErrorBanner";

const Audit: React.FC = () => {
  React.useEffect(() => {
    document.title = "Dogtag PKI - Audit";
  }, []);

  const { data: audit, isLoading, error } = useGetAuditConfigQuery();

  const eventEntries = audit?.Events
    ? Object.entries(audit.Events).sort(([a], [b]) => a.localeCompare(b))
    : [];

  const enabledCount = eventEntries.filter(([, v]) => v === "enabled").length;

  return (
    <>
      <PageSection hasBodyWrapper={false} variant={PageSectionVariants.default}>
        <BreadcrumbLayout items={[{ name: "Audit", url: "/audit" }]} />
        <Content component="h1">Audit Configuration</Content>
      </PageSection>
      <PageSection hasBodyWrapper={false} isFilled={false}>
        {error && <ErrorBanner message="Failed to load audit configuration." />}
        {isLoading ? (
          <Bullseye>
            <Spinner size="xl" />
          </Bullseye>
        ) : audit ? (
          <Flex
            direction={{ default: "column" }}
            spaceItems={{ default: "spaceItemsLg" }}
          >
            <FlexItem>
              <Card>
                <CardTitle>Audit Subsystem</CardTitle>
                <CardBody>
                  <DescriptionList isHorizontal>
                    <DescriptionListGroup>
                      <DescriptionListTerm>Status</DescriptionListTerm>
                      <DescriptionListDescription>
                        <Label
                          color={audit.Status === "Enabled" ? "green" : "red"}
                        >
                          {audit.Status}
                        </Label>
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                    <DescriptionListGroup>
                      <DescriptionListTerm>
                        Signed Audit Log
                      </DescriptionListTerm>
                      <DescriptionListDescription>
                        <Label color={audit.Signed ? "green" : "orange"}>
                          {audit.Signed ? "Yes" : "No"}
                        </Label>
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                    <DescriptionListGroup>
                      <DescriptionListTerm>Flush Interval</DescriptionListTerm>
                      <DescriptionListDescription>
                        {audit.Interval}s
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                    <DescriptionListGroup>
                      <DescriptionListTerm>Buffer Size</DescriptionListTerm>
                      <DescriptionListDescription>
                        {audit.bufferSize}
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                  </DescriptionList>
                </CardBody>
              </Card>
            </FlexItem>
            <FlexItem>
              <Card>
                <CardTitle>
                  Audit Events ({enabledCount} of {eventEntries.length} enabled)
                </CardTitle>
                <CardBody>
                  <Table aria-label="Audit events table" variant="compact">
                    <Thead>
                      <Tr>
                        <Th>Event</Th>
                        <Th>Status</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {eventEntries.map(([event, status]) => (
                        <Tr key={event}>
                          <Td>{event}</Td>
                          <Td>
                            <Label
                              color={status === "enabled" ? "green" : "grey"}
                            >
                              {status}
                            </Label>
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </CardBody>
              </Card>
            </FlexItem>
          </Flex>
        ) : null}
      </PageSection>
    </>
  );
};

export default Audit;
