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
import ValidityBar from "src/components/ValidityBar";
import StatusLabel from "src/components/StatusLabel";
import ErrorBanner from "src/components/ErrorBanner";
import { useGetCertificatesQuery, dogtagApi } from "src/services/dogtagApi";
import { useAppDispatch } from "src/store/store";
import { hasCodeSigningEKU, extractSignerIdentity } from "src/utils/certUtils";
import { spireSigstoreConfig } from "src/config/spireConfig";
import type { CodeSigningRecord } from "src/types/spire";

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

type TimeRange = "24h" | "7d" | "30d" | "all";

function timeRangeMs(range: TimeRange): number {
  switch (range) {
    case "24h":
      return 24 * 60 * 60 * 1000;
    case "7d":
      return 7 * 24 * 60 * 60 * 1000;
    case "30d":
      return 30 * 24 * 60 * 60 * 1000;
    case "all":
      return Infinity;
  }
}

const CodeSigning: React.FC = () => {
  React.useEffect(() => {
    document.title = "Dogtag PKI - Code Signing Activity";
  }, []);

  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [timeRange, setTimeRange] = React.useState<TimeRange>("7d");

  const [records, setRecords] = React.useState<CodeSigningRecord[]>([]);
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
            prettyPrint: detail.PrettyPrint ?? "",
          }))
          .catch(() => ({ cert: c, prettyPrint: "" })),
      ),
    ).then((results) => {
      if (cancelled) return;
      const csRecords: CodeSigningRecord[] = [];
      for (const { cert, prettyPrint } of results) {
        const isCodeSigning =
          hasCodeSigningEKU(prettyPrint) ||
          (spireSigstoreConfig.fulcioIssuerDN &&
            cert.IssuerDN.includes(spireSigstoreConfig.fulcioIssuerDN));

        if (!isCodeSigning) continue;

        const windowMs = cert.NotValidAfter - cert.NotValidBefore;
        csRecords.push({
          certId: cert.id,
          serialNumber: cert.id,
          signerIdentity: extractSignerIdentity(prettyPrint) ?? cert.SubjectDN,
          issuerDN: cert.IssuerDN,
          issuedOn: cert.IssuedOn,
          notValidBefore: cert.NotValidBefore,
          notValidAfter: cert.NotValidAfter,
          validityWindowMinutes: Math.round(windowMs / 60000),
          status: cert.Status,
        });
      }
      csRecords.sort((a, b) => b.issuedOn - a.issuedOn);
      setRecords(csRecords);
      setScanning(false);
      setScanned(true);
    });

    return () => {
      cancelled = true;
    };
  }, [certs, dispatch, scanned]);

  const filtered = records.filter((r) => {
    if (timeRange !== "all") {
      const cutoff = Date.now() - timeRangeMs(timeRange);
      if (r.issuedOn < cutoff) return false;
    }
    if (search) {
      const term = search.toLowerCase();
      if (!r.signerIdentity.toLowerCase().includes(term)) return false;
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
          items={[{ name: "Code Signing Activity", url: "/code-signing" }]}
        />
        <Content component="h1">Code Signing Activity</Content>
        <Content component="p">
          Fulcio-issued code-signing certificates tracked by Dogtag PKI.
        </Content>
      </PageSection>
      <PageSection hasBodyWrapper={false} isFilled={false}>
        {error && <ErrorBanner message="Failed to load certificates." />}
        <Toolbar>
          <ToolbarContent>
            <ToolbarItem>
              <SearchInput
                placeholder="Filter by signer identity"
                value={search}
                onChange={(_e, val) => setSearch(val)}
                onClear={() => setSearch("")}
              />
            </ToolbarItem>
            <ToolbarItem>
              <FormSelect
                value={timeRange}
                onChange={(_e, val) => setTimeRange(val as TimeRange)}
                aria-label="Time range"
              >
                <FormSelectOption value="24h" label="Last 24 hours" />
                <FormSelectOption value="7d" label="Last 7 days" />
                <FormSelectOption value="30d" label="Last 30 days" />
                <FormSelectOption value="all" label="All time" />
              </FormSelect>
            </ToolbarItem>
            <ToolbarItem>
              <Label color="purple" isCompact>
                {filtered.length} signing cert
                {filtered.length !== 1 ? "s" : ""}
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
          <Table aria-label="Code signing activity table">
            <Thead>
              <Tr>
                <Th>Signer Identity</Th>
                <Th>Serial</Th>
                <Th>Issued</Th>
                <Th>Valid Until</Th>
                <Th>Window</Th>
                <Th>Validity</Th>
                <Th>Status</Th>
                <Th />
              </Tr>
            </Thead>
            <Tbody>
              {pageItems.length === 0 ? (
                <Tr>
                  <Td colSpan={8}>
                    <Content component="small">
                      {scanned
                        ? "No code-signing certificates found."
                        : "Scanning certificates..."}
                    </Content>
                  </Td>
                </Tr>
              ) : (
                pageItems.map((r) => (
                  <Tr key={r.certId}>
                    <Td>
                      <Label color="purple" isCompact>
                        {r.signerIdentity}
                      </Label>
                    </Td>
                    <Td>{r.serialNumber}</Td>
                    <Td>{formatDate(r.issuedOn)}</Td>
                    <Td>{formatDate(r.notValidAfter)}</Td>
                    <Td>{r.validityWindowMinutes} min</Td>
                    <Td>
                      <ValidityBar
                        notBefore={r.notValidBefore}
                        notAfter={r.notValidAfter}
                      />
                    </Td>
                    <Td>
                      <StatusLabel status={r.status} />
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

export default CodeSigning;
