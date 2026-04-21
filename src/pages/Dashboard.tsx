import React from "react";
import {
  PageSection,
  PageSectionVariants,
  Content,
  Card,
  CardTitle,
  CardBody,
  Flex,
  FlexItem,
  Spinner,
  Bullseye,
  Label,
  Gallery,
  GalleryItem,
  DescriptionList,
  DescriptionListGroup,
  DescriptionListTerm,
  DescriptionListDescription,
  Button,
} from "@patternfly/react-core";
import { Table, Thead, Tr, Th, Tbody, Td } from "@patternfly/react-table";
import { useNavigate } from "react-router";
import StatusLabel from "src/components/StatusLabel";
import {
  useGetCertificatesQuery,
  useGetCertRequestsQuery,
  useGetProfilesQuery,
  useGetAuthoritiesQuery,
  dogtagApi,
  type AuthorityData,
} from "src/services/dogtagApi";
import { useAppDispatch } from "src/store/store";
import {
  extractURISANs,
  parseSpiffeId,
  hasCodeSigningEKU,
} from "src/utils/certUtils";

function daysUntil(epochMs: number): number {
  return Math.ceil((epochMs - Date.now()) / 86_400_000);
}

const Dashboard: React.FC = () => {
  React.useEffect(() => {
    document.title = "Dogtag PKI - Dashboard";
  }, []);

  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { data: certData, isLoading: certsLoading } = useGetCertificatesQuery({
    start: 0,
    size: 100,
  });
  const { data: reqData, isLoading: reqsLoading } = useGetCertRequestsQuery({
    start: 0,
    size: 20,
  });
  const { data: profileData, isLoading: profilesLoading } =
    useGetProfilesQuery();
  const { data: authData, isLoading: authLoading } = useGetAuthoritiesQuery();

  const certs = certData?.entries ?? [];
  const requests = reqData?.entries ?? [];
  const profiles = profileData?.entries ?? [];
  const authorities: AuthorityData[] = Array.isArray(authData) ? authData : [];

  const [svidCount, setSvidCount] = React.useState(0);
  const [codeSignCount, setCodeSignCount] = React.useState(0);
  const [dashScanned, setDashScanned] = React.useState(false);

  React.useEffect(() => {
    if (certs.length === 0 || dashScanned) return;
    let cancelled = false;

    Promise.all(
      certs.map((c) =>
        dispatch(dogtagApi.endpoints.getAgentCert.initiate(c.id))
          .unwrap()
          .then((d) => ({ cert: c, pp: d.PrettyPrint ?? "" }))
          .catch(() => ({ cert: c, pp: "" })),
      ),
    ).then((results) => {
      if (cancelled) return;
      let svids = 0;
      let signing = 0;
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      for (const { cert, pp } of results) {
        if (cert.Status !== "VALID") continue;
        const uris = extractURISANs(pp);
        if (uris.some((u) => parseSpiffeId(u) !== null)) svids++;
        if (hasCodeSigningEKU(pp) && cert.IssuedOn >= oneDayAgo) signing++;
      }
      setSvidCount(svids);
      setCodeSignCount(signing);
      setDashScanned(true);
    });

    return () => {
      cancelled = true;
    };
  }, [certs, dispatch, dashScanned]);

  const validCerts = certs.filter((c) => c.Status === "VALID");
  const revokedCerts = certs.filter((c) => c.Status === "REVOKED");
  const pendingReqs = requests.filter((r) => r.requestStatus === "pending");
  const enabledProfiles = profiles.filter(
    (p) => String(p.enabled ?? p.profileEnabled ?? false) === "true",
  );

  const expiringSoon = validCerts
    .filter((c) => {
      const days = daysUntil(c.NotValidAfter);
      return days >= 0 && days <= 30;
    })
    .sort((a, b) => a.NotValidAfter - b.NotValidAfter);

  const isLoading =
    certsLoading || reqsLoading || profilesLoading || authLoading;

  return (
    <>
      <PageSection hasBodyWrapper={false} variant={PageSectionVariants.default}>
        <Content component="h1">Dashboard</Content>
        <Content component="p">
          Certificate Authority overview and quick actions.
        </Content>
      </PageSection>
      <PageSection hasBodyWrapper={false} isFilled={false}>
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
              <Gallery
                hasGutter
                minWidths={{ default: "200px" }}
                maxWidths={{ default: "1fr" }}
              >
                <GalleryItem>
                  <Card isClickable onClick={() => navigate("/certificates")}>
                    <CardTitle>Certificates</CardTitle>
                    <CardBody>
                      <Content component="h2" className="pf-v6-u-mb-sm">
                        {certData?.total ?? certs.length}
                      </Content>
                      <Flex spaceItems={{ default: "spaceItemsSm" }}>
                        <FlexItem>
                          <Label color="green" isCompact>
                            {validCerts.length} valid
                          </Label>
                        </FlexItem>
                        <FlexItem>
                          <Label color="red" isCompact>
                            {revokedCerts.length} revoked
                          </Label>
                        </FlexItem>
                      </Flex>
                    </CardBody>
                  </Card>
                </GalleryItem>
                <GalleryItem>
                  <Card isClickable onClick={() => navigate("/requests")}>
                    <CardTitle>Pending Requests</CardTitle>
                    <CardBody>
                      <Content component="h2" className="pf-v6-u-mb-sm">
                        {pendingReqs.length}
                      </Content>
                      <Content component="small">
                        {reqData?.total ?? requests.length} total requests
                      </Content>
                    </CardBody>
                  </Card>
                </GalleryItem>
                <GalleryItem>
                  <Card isClickable onClick={() => navigate("/profiles")}>
                    <CardTitle>Profiles</CardTitle>
                    <CardBody>
                      <Content component="h2" className="pf-v6-u-mb-sm">
                        {profiles.length}
                      </Content>
                      <Content component="small">
                        {enabledProfiles.length} enabled
                      </Content>
                    </CardBody>
                  </Card>
                </GalleryItem>
                <GalleryItem>
                  <Card isClickable onClick={() => navigate("/authorities")}>
                    <CardTitle>Authorities</CardTitle>
                    <CardBody>
                      <Content component="h2" className="pf-v6-u-mb-sm">
                        {authorities.length}
                      </Content>
                    </CardBody>
                  </Card>
                </GalleryItem>
                <GalleryItem>
                  <Card
                    isClickable
                    onClick={() => navigate("/workload-identities")}
                  >
                    <CardTitle>Active SVIDs</CardTitle>
                    <CardBody>
                      <Content component="h2" className="pf-v6-u-mb-sm">
                        {svidCount}
                      </Content>
                      <Content component="small">
                        SPIRE workload identities
                      </Content>
                    </CardBody>
                  </Card>
                </GalleryItem>
                <GalleryItem>
                  <Card isClickable onClick={() => navigate("/code-signing")}>
                    <CardTitle>Code Signing (24h)</CardTitle>
                    <CardBody>
                      <Content component="h2" className="pf-v6-u-mb-sm">
                        {codeSignCount}
                      </Content>
                      <Content component="small">
                        Fulcio signing certs issued
                      </Content>
                    </CardBody>
                  </Card>
                </GalleryItem>
                <GalleryItem>
                  <Card isClickable onClick={() => navigate("/trust-chain")}>
                    <CardTitle>Trust Chain</CardTitle>
                    <CardBody>
                      <Content component="h2" className="pf-v6-u-mb-sm">
                        <Label
                          color={
                            authorities.length > 0 &&
                            authorities.every(
                              (a) => a.enabled && (a.ready ?? true),
                            )
                              ? "green"
                              : "orange"
                          }
                          isCompact
                        >
                          {authorities.length > 0 &&
                          authorities.every(
                            (a) => a.enabled && (a.ready ?? true),
                          )
                            ? "Healthy"
                            : "Attention"}
                        </Label>
                      </Content>
                      <Content component="small">
                        {authorities.length} CA
                        {authorities.length !== 1 ? "s" : ""} in hierarchy
                      </Content>
                    </CardBody>
                  </Card>
                </GalleryItem>
              </Gallery>
            </FlexItem>

            {expiringSoon.length > 0 && (
              <FlexItem>
                <Card>
                  <CardTitle>
                    <Flex>
                      <FlexItem>Expiring Soon (next 30 days)</FlexItem>
                      <FlexItem align={{ default: "alignRight" }}>
                        <Label color="orange" isCompact>
                          {expiringSoon.length} certificate
                          {expiringSoon.length !== 1 ? "s" : ""}
                        </Label>
                      </FlexItem>
                    </Flex>
                  </CardTitle>
                  <CardBody>
                    <Table aria-label="Expiring certificates" variant="compact">
                      <Thead>
                        <Tr>
                          <Th>Serial</Th>
                          <Th>Subject DN</Th>
                          <Th>Expires In</Th>
                          <Th />
                        </Tr>
                      </Thead>
                      <Tbody>
                        {expiringSoon.slice(0, 10).map((cert) => (
                          <Tr key={cert.id}>
                            <Td>{cert.id}</Td>
                            <Td>{cert.SubjectDN}</Td>
                            <Td>
                              <Label
                                color={
                                  daysUntil(cert.NotValidAfter) <= 7
                                    ? "red"
                                    : "orange"
                                }
                                isCompact
                              >
                                {daysUntil(cert.NotValidAfter)} days
                              </Label>
                            </Td>
                            <Td>
                              <Button
                                variant="link"
                                size="sm"
                                onClick={() =>
                                  navigate(
                                    `/certificates/${encodeURIComponent(cert.id)}`,
                                  )
                                }
                              >
                                View
                              </Button>
                            </Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  </CardBody>
                </Card>
              </FlexItem>
            )}

            {pendingReqs.length > 0 && (
              <FlexItem>
                <Card>
                  <CardTitle>
                    <Flex>
                      <FlexItem>Pending Requests</FlexItem>
                      <FlexItem align={{ default: "alignRight" }}>
                        <Button
                          variant="link"
                          size="sm"
                          onClick={() => navigate("/requests")}
                        >
                          View all
                        </Button>
                      </FlexItem>
                    </Flex>
                  </CardTitle>
                  <CardBody>
                    <DescriptionList isHorizontal isCompact>
                      {pendingReqs.slice(0, 5).map((req) => (
                        <DescriptionListGroup key={req.requestID}>
                          <DescriptionListTerm>
                            {req.requestID}
                          </DescriptionListTerm>
                          <DescriptionListDescription>
                            <Flex spaceItems={{ default: "spaceItemsSm" }}>
                              <FlexItem>
                                {req.certRequestType ?? req.requestType}
                              </FlexItem>
                              <FlexItem>
                                <StatusLabel status={req.requestStatus} />
                              </FlexItem>
                            </Flex>
                          </DescriptionListDescription>
                        </DescriptionListGroup>
                      ))}
                    </DescriptionList>
                  </CardBody>
                </Card>
              </FlexItem>
            )}

            <FlexItem>
              <Card>
                <CardTitle>Quick Actions</CardTitle>
                <CardBody>
                  <Flex spaceItems={{ default: "spaceItemsMd" }}>
                    <FlexItem>
                      <Button
                        variant="primary"
                        onClick={() => navigate("/enroll")}
                      >
                        Enroll Certificate
                      </Button>
                    </FlexItem>
                    <FlexItem>
                      <Button
                        variant="secondary"
                        onClick={() => navigate("/profiles/create")}
                      >
                        Create Profile
                      </Button>
                    </FlexItem>
                    <FlexItem>
                      <Button
                        variant="secondary"
                        onClick={() => navigate("/requests")}
                      >
                        Review Requests
                      </Button>
                    </FlexItem>
                  </Flex>
                </CardBody>
              </Card>
            </FlexItem>
          </Flex>
        )}
      </PageSection>
    </>
  );
};

export default Dashboard;
