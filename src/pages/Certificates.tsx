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
} from "@patternfly/react-core";
import { Table, Thead, Tr, Th, Tbody, Td } from "@patternfly/react-table";
import { useNavigate } from "react-router";
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

const PAGE_SIZE = 20;

const Certificates: React.FC = () => {
  React.useEffect(() => {
    document.title = "Dogtag PKI - Certificates";
  }, []);

  const navigate = useNavigate();
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("ALL");

  const { data, isLoading, error } = useGetCertificatesQuery({
    start: (page - 1) * PAGE_SIZE,
    size: PAGE_SIZE,
  });
  const certs = data?.entries ?? [];
  const total = data?.total ?? 0;

  const filtered = certs.filter((cert) => {
    if (statusFilter !== "ALL" && cert.Status !== statusFilter) return false;
    if (search && !cert.SubjectDN.toLowerCase().includes(search.toLowerCase()))
      return false;
    return true;
  });

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
              <SearchInput
                placeholder="Filter by Subject DN"
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
                itemCount={total}
                perPage={PAGE_SIZE}
                page={page}
                onSetPage={(_e, p) => setPage(p)}
                isCompact
              />
            </ToolbarItem>
          </ToolbarContent>
        </Toolbar>
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
                <Th />
              </Tr>
            </Thead>
            <Tbody>
              {filtered.length === 0 ? (
                <Tr>
                  <Td colSpan={7}>
                    <Content component="small">No certificates found.</Content>
                  </Td>
                </Tr>
              ) : (
                filtered.map((cert) => (
                  <Tr key={cert.id}>
                    <Td>{cert.id}</Td>
                    <Td>{cert.SubjectDN}</Td>
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
