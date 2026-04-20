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
  Grid,
  GridItem,
} from "@patternfly/react-core";
import { Table, Thead, Tr, Th, Tbody, Td } from "@patternfly/react-table";
import BreadcrumbLayout from "src/components/BreadcrumbLayout";
import {
  useGetAuditConfigQuery,
  useGetGroupsQuery,
  useGetProfilesQuery,
} from "src/services/dogtagApi";
import ErrorBanner from "src/components/ErrorBanner";

const CC_ROLES = [
  { id: "Administrators", sfr: "FMT_SMR.2", label: "Administrator" },
  { id: "Auditors", sfr: "FMT_SMR.2", label: "Auditor" },
  {
    id: "Certificate Manager Agents",
    sfr: "FMT_SMR.2",
    label: "CA Operations Staff",
  },
  { id: "Registration Manager Agents", sfr: "FMT_SMR.2", label: "RA Staff" },
];

const REQUIRED_EXTENSIONS = [
  "Subject Key Identifier",
  "Authority Key Identifier",
  "Basic Constraints",
  "Key Usage",
];

interface CheckResult {
  label: string;
  sfr: string;
  pass: boolean;
  detail: string;
}

const CCCompliance: React.FC = () => {
  React.useEffect(() => {
    document.title = "Dogtag PKI - CC Compliance";
  }, []);

  const {
    data: audit,
    isLoading: auditLoading,
    error: auditError,
  } = useGetAuditConfigQuery();
  const {
    data: groups,
    isLoading: groupsLoading,
    error: groupsError,
  } = useGetGroupsQuery();
  const {
    data: profiles,
    isLoading: profilesLoading,
    error: profilesError,
  } = useGetProfilesQuery();

  const isLoading = auditLoading || groupsLoading || profilesLoading;
  const hasError = auditError || groupsError || profilesError;

  const checks: CheckResult[] = [];

  if (audit) {
    checks.push({
      label: "Audit Logging Enabled",
      sfr: "FAU_GEN.1",
      pass: audit.Status === "Enabled",
      detail:
        audit.Status === "Enabled"
          ? "Audit subsystem is active"
          : "Audit subsystem is disabled",
    });
    checks.push({
      label: "Signed Audit Logs",
      sfr: "FAU_STG.1",
      pass: audit.Signed === true,
      detail: audit.Signed
        ? "Audit logs are cryptographically signed"
        : "Audit log signing is disabled",
    });

    const eventEntries = Object.entries(audit.Events ?? {});
    const enabledCount = eventEntries.filter(([, v]) => v === "enabled").length;
    checks.push({
      label: "Audit Event Coverage",
      sfr: "FAU_SEL.1",
      pass: enabledCount > 0,
      detail: `${enabledCount} of ${eventEntries.length} events enabled`,
    });
  }

  if (groups) {
    const groupIds = new Set(groups.entries.map((g) => g.GroupID));
    for (const role of CC_ROLES) {
      checks.push({
        label: `${role.label} Group Exists`,
        sfr: role.sfr,
        pass: groupIds.has(role.id),
        detail: groupIds.has(role.id)
          ? `Group "${role.id}" present`
          : `Group "${role.id}" not found`,
      });
    }
  }

  if (profiles) {
    const enabledProfiles = profiles.entries.filter((p) => p.enabled);
    checks.push({
      label: "Certificate Profiles Available",
      sfr: "FDP_CER_EXT.1",
      pass: enabledProfiles.length > 0,
      detail: `${enabledProfiles.length} enabled profile(s)`,
    });
  }

  const passCount = checks.filter((c) => c.pass).length;
  const totalChecks = checks.length;
  const allPass = totalChecks > 0 && passCount === totalChecks;

  return (
    <>
      <PageSection hasBodyWrapper={false} variant={PageSectionVariants.default}>
        <BreadcrumbLayout
          items={[{ name: "CC Compliance", url: "/cc-compliance" }]}
        />
        <Content component="h1">Common Criteria Compliance Dashboard</Content>
        <Content component="p">
          NIAP Protection Profile for Certification Authorities V2.1 compliance
          status.
        </Content>
      </PageSection>
      <PageSection hasBodyWrapper={false} isFilled={false}>
        {hasError && (
          <ErrorBanner message="Some compliance data could not be loaded." />
        )}
        {isLoading ? (
          <Bullseye>
            <Spinner size="xl" />
          </Bullseye>
        ) : (
          <Flex
            direction={{ default: "column" }}
            spaceItems={{ default: "spaceItemsLg" }}
          >
            <FlexItem>
              <Grid hasGutter>
                <GridItem span={4}>
                  <Card>
                    <CardTitle>Overall Status</CardTitle>
                    <CardBody>
                      <Bullseye>
                        <Label
                          color={allPass ? "green" : "orange"}
                          isCompact={false}
                        >
                          {allPass
                            ? "COMPLIANT"
                            : `${passCount}/${totalChecks} PASSING`}
                        </Label>
                      </Bullseye>
                    </CardBody>
                  </Card>
                </GridItem>
                <GridItem span={4}>
                  <Card>
                    <CardTitle>Audit Subsystem</CardTitle>
                    <CardBody>
                      <DescriptionList isCompact>
                        <DescriptionListGroup>
                          <DescriptionListTerm>Status</DescriptionListTerm>
                          <DescriptionListDescription>
                            <Label
                              color={
                                audit?.Status === "Enabled" ? "green" : "red"
                              }
                            >
                              {audit?.Status ?? "Unknown"}
                            </Label>
                          </DescriptionListDescription>
                        </DescriptionListGroup>
                        <DescriptionListGroup>
                          <DescriptionListTerm>Signed</DescriptionListTerm>
                          <DescriptionListDescription>
                            <Label color={audit?.Signed ? "green" : "orange"}>
                              {audit?.Signed ? "Yes" : "No"}
                            </Label>
                          </DescriptionListDescription>
                        </DescriptionListGroup>
                      </DescriptionList>
                    </CardBody>
                  </Card>
                </GridItem>
                <GridItem span={4}>
                  <Card>
                    <CardTitle>Required Extensions (FDP_CER_EXT.1)</CardTitle>
                    <CardBody>
                      {REQUIRED_EXTENSIONS.map((ext) => (
                        <div key={ext} className="pf-v6-u-mb-xs">
                          <Label color="blue" isCompact>
                            {ext}
                          </Label>
                        </div>
                      ))}
                    </CardBody>
                  </Card>
                </GridItem>
              </Grid>
            </FlexItem>
            <FlexItem>
              <Card>
                <CardTitle>Compliance Checks</CardTitle>
                <CardBody>
                  <Table aria-label="CC compliance checks" variant="compact">
                    <Thead>
                      <Tr>
                        <Th>Check</Th>
                        <Th>SFR</Th>
                        <Th>Status</Th>
                        <Th>Detail</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {checks.map((c) => (
                        <Tr key={c.label}>
                          <Td>{c.label}</Td>
                          <Td>
                            <Label isCompact color="blue">
                              {c.sfr}
                            </Label>
                          </Td>
                          <Td>
                            <Label color={c.pass ? "green" : "red"}>
                              {c.pass ? "PASS" : "FAIL"}
                            </Label>
                          </Td>
                          <Td>{c.detail}</Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </CardBody>
              </Card>
            </FlexItem>
          </Flex>
        )}
      </PageSection>
    </>
  );
};

export default CCCompliance;
