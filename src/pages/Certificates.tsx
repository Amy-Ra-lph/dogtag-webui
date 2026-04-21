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
import { useGetCertificatesQuery, dogtagApi } from "src/services/dogtagApi";
import { useAppDispatch } from "src/store/store";
import StatusLabel from "src/components/StatusLabel";
import ErrorBanner from "src/components/ErrorBanner";
import { extractSANs } from "src/utils/certUtils";

function formatDate(epoch: number): string {
  return new Date(epoch).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const PAGE_SIZE = 20;

type SearchField = "subjectDN" | "san";

const Certificates: React.FC = () => {
  React.useEffect(() => {
    document.title = "Dogtag PKI - Certificates";
  }, []);

  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [searchField, setSearchField] =
    React.useState<SearchField>("subjectDN");
  const [statusFilter, setStatusFilter] = React.useState("ALL");

  const [sanMap, setSanMap] = React.useState<Record<string, string[]>>({});
  const [sanLoading, setSanLoading] = React.useState(false);

  const { data, isLoading, error } = useGetCertificatesQuery({
    start: (page - 1) * PAGE_SIZE,
    size: PAGE_SIZE,
  });
  const certs = data?.entries ?? [];
  const total = data?.total ?? 0;

  React.useEffect(() => {
    if (searchField !== "san" || certs.length === 0) return;

    const uncached = certs.filter((c) => !(c.id in sanMap));
    if (uncached.length === 0) return;

    let cancelled = false;
    setSanLoading(true);

    Promise.all(
      uncached.map((c) =>
        dispatch(dogtagApi.endpoints.getAgentCert.initiate(c.id))
          .unwrap()
          .then((detail) => ({
            id: c.id,
            sans: extractSANs(detail.PrettyPrint ?? ""),
          }))
          .catch(() => ({ id: c.id, sans: [] as string[] })),
      ),
    ).then((results) => {
      if (cancelled) return;
      setSanMap((prev) => {
        const next = { ...prev };
        for (const r of results) next[r.id] = r.sans;
        return next;
      });
      setSanLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [searchField, certs, dispatch]);

  const filtered = certs.filter((cert) => {
    if (statusFilter !== "ALL" && cert.Status !== statusFilter) return false;
    if (search) {
      const term = search.replace(/\*/g, "").toLowerCase();
      if (!term) return true;
      if (searchField === "subjectDN") {
        if (!cert.SubjectDN.toLowerCase().includes(term)) return false;
      } else {
        const sans = sanMap[cert.id] ?? [];
        if (!sans.some((s) => s.toLowerCase().includes(term))) return false;
      }
    }
    return true;
  });

  const sanSearchActive = searchField === "san" && !!search;

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
        <Toolbar>
          <ToolbarContent>
            <ToolbarItem>
              <FormSelect
                value={searchField}
                onChange={(_e, val) => setSearchField(val as SearchField)}
                aria-label="Search field"
              >
                <FormSelectOption value="subjectDN" label="Subject DN" />
                <FormSelectOption value="san" label="SAN" />
              </FormSelect>
            </ToolbarItem>
            <ToolbarItem>
              <SearchInput
                placeholder={
                  searchField === "subjectDN"
                    ? "Filter by Subject DN"
                    : "Filter by SAN (DNS name, IP, email)"
                }
                value={search}
                onChange={(_e, val) => setSearch(val)}
                onClear={() => setSearch("")}
              />
            </ToolbarItem>
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
            <ToolbarItem variant="pagination" align={{ default: "alignEnd" }}>
              <Pagination
                itemCount={
                  filtered.length < certs.length ? filtered.length : total
                }
                perPage={PAGE_SIZE}
                page={page}
                onSetPage={(_e, p) => setPage(p)}
                isCompact
              />
            </ToolbarItem>
          </ToolbarContent>
        </Toolbar>
        {isLoading || (sanSearchActive && sanLoading) ? (
          <Bullseye>
            <Spinner size="xl" />
          </Bullseye>
        ) : (
          <Table aria-label="Certificates table">
            <Thead>
              <Tr>
                <Th>Serial Number</Th>
                <Th>Subject DN</Th>
                {sanSearchActive && <Th>SANs</Th>}
                <Th>Status</Th>
                <Th>Not Valid Before</Th>
                <Th>Not Valid After</Th>
                <Th>Issued By</Th>
                <Th />
              </Tr>
            </Thead>
            <Tbody>
              {filtered.length === 0 ? (
                <Tr>
                  <Td colSpan={sanSearchActive ? 8 : 7}>
                    <Content component="small">No certificates found.</Content>
                  </Td>
                </Tr>
              ) : (
                filtered.map((cert) => (
                  <Tr key={cert.id}>
                    <Td>{cert.id}</Td>
                    <Td>{cert.SubjectDN}</Td>
                    {sanSearchActive && (
                      <Td>
                        {(sanMap[cert.id] ?? []).map((san) => (
                          <Label key={san} isCompact className="pf-v6-u-mr-xs">
                            {san}
                          </Label>
                        ))}
                      </Td>
                    )}
                    <Td>
                      <StatusLabel status={cert.Status} />
                    </Td>
                    <Td>{formatDate(cert.NotValidBefore)}</Td>
                    <Td>{formatDate(cert.NotValidAfter)}</Td>
                    <Td>{cert.IssuedBy}</Td>
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
