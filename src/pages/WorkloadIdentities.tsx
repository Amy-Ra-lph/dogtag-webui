import React from "react";
import {
  PageSection,
  PageSectionVariants,
  Content,
  Spinner,
  Bullseye,
  Button,
  Pagination,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
  SearchInput,
  FormSelect,
  FormSelectOption,
  Label,
} from "@patternfly/react-core";
import { Table, Thead, Tr, Th, Tbody, Td } from "@patternfly/react-table";
import { useNavigate } from "react-router";
import BreadcrumbLayout from "src/components/BreadcrumbLayout";
import SPIFFEIDBadge from "src/components/SPIFFEIDBadge";
import ValidityBar from "src/components/ValidityBar";
import StatusLabel from "src/components/StatusLabel";
import ErrorBanner from "src/components/ErrorBanner";
import { useGetCertificatesQuery, dogtagApi } from "src/services/dogtagApi";
import { useAppDispatch } from "src/store/store";
import { extractURISANs, parseSpiffeId } from "src/utils/certUtils";
import type { SvidRecord } from "src/types/spire";

function formatDate(epoch: number): string {
  return new Date(epoch).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const PAGE_SIZE = 20;
const FETCH_BATCH = 100;

const WorkloadIdentities: React.FC = () => {
  React.useEffect(() => {
    document.title = "Dogtag PKI - Workload Identities";
  }, []);

  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("ALL");
  const [trustDomainFilter, setTrustDomainFilter] = React.useState("ALL");

  const [svidRecords, setSvidRecords] = React.useState<SvidRecord[]>([]);
  const [scanning, setScanning] = React.useState(false);
  const [scanned, setScanned] = React.useState(false);

  const { data, isLoading, error } = useGetCertificatesQuery({
    start: 0,
    size: FETCH_BATCH,
  });
  const certs = data?.entries ?? [];

  React.useEffect(() => {
    if (certs.length === 0 || scanned) return;

    let cancelled = false;
    setScanning(true);

    Promise.all(
      certs.map((c) =>
        dispatch(dogtagApi.endpoints.getAgentCert.initiate(c.id))
          .unwrap()
          .then((detail) => ({
            cert: c,
            uriSans: extractURISANs(detail.PrettyPrint ?? ""),
          }))
          .catch(() => ({ cert: c, uriSans: [] as string[] })),
      ),
    ).then((results) => {
      if (cancelled) return;
      const records: SvidRecord[] = [];
      for (const { cert, uriSans } of results) {
        for (const uri of uriSans) {
          const spiffeId = parseSpiffeId(uri);
          if (spiffeId) {
            records.push({
              certId: cert.id,
              spiffeId,
              serialNumber: cert.id,
              subjectDN: cert.SubjectDN,
              issuerDN: cert.IssuerDN,
              issuedOn: cert.IssuedOn,
              notValidBefore: cert.NotValidBefore,
              notValidAfter: cert.NotValidAfter,
              status: cert.Status,
            });
          }
        }
      }
      setSvidRecords(records);
      setScanning(false);
      setScanned(true);
    });

    return () => {
      cancelled = true;
    };
  }, [certs, dispatch, scanned]);

  const trustDomains = React.useMemo(() => {
    const domains = new Set(svidRecords.map((r) => r.spiffeId.trustDomain));
    return Array.from(domains).sort();
  }, [svidRecords]);

  const filtered = svidRecords.filter((r) => {
    if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
    if (
      trustDomainFilter !== "ALL" &&
      r.spiffeId.trustDomain !== trustDomainFilter
    )
      return false;
    if (search) {
      const term = search.toLowerCase();
      if (!r.spiffeId.raw.toLowerCase().includes(term)) return false;
    }
    return true;
  });

  const totalFiltered = filtered.length;
  const pageStart = (page - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  const loading = isLoading || scanning;

  return (
    <>
      <PageSection hasBodyWrapper={false} variant={PageSectionVariants.default}>
        <BreadcrumbLayout
          items={[{ name: "Workload Identities", url: "/workload-identities" }]}
        />
        <Content component="h1">Workload Identities</Content>
        <Content component="p">
          SPIRE-issued X.509 SVIDs tracked by Dogtag PKI.
        </Content>
      </PageSection>
      <PageSection hasBodyWrapper={false} isFilled={false}>
        {error && <ErrorBanner message="Failed to load certificates." />}
        <Toolbar>
          <ToolbarContent>
            <ToolbarItem>
              <SearchInput
                placeholder="Filter by SPIFFE ID"
                value={search}
                onChange={(_e, val) => setSearch(val)}
                onClear={() => setSearch("")}
              />
            </ToolbarItem>
            {trustDomains.length > 1 && (
              <ToolbarItem>
                <FormSelect
                  value={trustDomainFilter}
                  onChange={(_e, val) => setTrustDomainFilter(val)}
                  aria-label="Filter by trust domain"
                >
                  <FormSelectOption value="ALL" label="All trust domains" />
                  {trustDomains.map((d) => (
                    <FormSelectOption key={d} value={d} label={d} />
                  ))}
                </FormSelect>
              </ToolbarItem>
            )}
            <ToolbarItem>
              <FormSelect
                value={statusFilter}
                onChange={(_e, val) => setStatusFilter(val)}
                aria-label="Filter by status"
              >
                <FormSelectOption value="ALL" label="All statuses" />
                <FormSelectOption value="VALID" label="Valid" />
                <FormSelectOption value="REVOKED" label="Revoked" />
                <FormSelectOption value="EXPIRED" label="Expired" />
              </FormSelect>
            </ToolbarItem>
            <ToolbarItem>
              <Label color="blue" isCompact>
                {svidRecords.length} SVID{svidRecords.length !== 1 ? "s" : ""}{" "}
                found
              </Label>
            </ToolbarItem>
            <ToolbarItem variant="pagination" align={{ default: "alignEnd" }}>
              <Pagination
                itemCount={totalFiltered}
                perPage={PAGE_SIZE}
                page={page}
                onSetPage={(_e, p) => setPage(p)}
                isCompact
              />
            </ToolbarItem>
          </ToolbarContent>
        </Toolbar>
        {loading ? (
          <Bullseye>
            <Spinner size="xl" />
          </Bullseye>
        ) : (
          <Table aria-label="Workload identities table">
            <Thead>
              <Tr>
                <Th>SPIFFE ID</Th>
                <Th>Serial</Th>
                <Th>Trust Domain</Th>
                <Th>Workload Path</Th>
                <Th>Status</Th>
                <Th>Issued</Th>
                <Th>Expires</Th>
                <Th>Validity</Th>
                <Th />
              </Tr>
            </Thead>
            <Tbody>
              {pageItems.length === 0 ? (
                <Tr>
                  <Td colSpan={9}>
                    <Content component="small">
                      {scanned
                        ? "No SPIRE SVIDs found in the certificate database."
                        : "Scanning certificates..."}
                    </Content>
                  </Td>
                </Tr>
              ) : (
                pageItems.map((r) => (
                  <Tr key={`${r.certId}-${r.spiffeId.raw}`}>
                    <Td>
                      <SPIFFEIDBadge spiffeId={r.spiffeId} />
                    </Td>
                    <Td>{r.serialNumber}</Td>
                    <Td>{r.spiffeId.trustDomain}</Td>
                    <Td>
                      <code>{r.spiffeId.workloadPath}</code>
                    </Td>
                    <Td>
                      <StatusLabel status={r.status} />
                    </Td>
                    <Td>{formatDate(r.issuedOn)}</Td>
                    <Td>{formatDate(r.notValidAfter)}</Td>
                    <Td>
                      <ValidityBar
                        notBefore={r.notValidBefore}
                        notAfter={r.notValidAfter}
                      />
                    </Td>
                    <Td>
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() =>
                          navigate(
                            `/certificates/${encodeURIComponent(r.certId)}`,
                          )
                        }
                      >
                        View Cert
                      </Button>
                    </Td>
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

export default WorkloadIdentities;
