import React from "react";
import {
  PageSection,
  PageSectionVariants,
  Content,
  Spinner,
  Bullseye,
  Button,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Alert,
  DescriptionList,
  DescriptionListGroup,
  DescriptionListTerm,
  DescriptionListDescription,
  Label,
} from "@patternfly/react-core";
import { Table, Thead, Tr, Th, Tbody, Td } from "@patternfly/react-table";
import BreadcrumbLayout from "src/components/BreadcrumbLayout";
import {
  useGetCertRequestsQuery,
  useGetRequestReviewQuery,
  useApproveRequestMutation,
  useRejectRequestMutation,
} from "src/services/dogtagApi";
import StatusLabel from "src/components/StatusLabel";
import ErrorBanner from "src/components/ErrorBanner";

const Requests: React.FC = () => {
  React.useEffect(() => {
    document.title = "Dogtag PKI - Requests";
  }, []);

  const { data, isLoading, error } = useGetCertRequestsQuery();
  const requests = data?.entries ?? [];

  const [reviewId, setReviewId] = React.useState<string | null>(null);
  const [actionResult, setActionResult] = React.useState<{
    success: boolean;
    message: string;
  } | null>(null);

  return (
    <>
      <PageSection hasBodyWrapper={false} variant={PageSectionVariants.default}>
        <BreadcrumbLayout items={[{ name: "Requests", url: "/requests" }]} />
        <Content component="h1">Certificate Requests</Content>
      </PageSection>
      <PageSection hasBodyWrapper={false} isFilled={false}>
        {error && (
          <ErrorBanner message="Failed to load certificate requests." />
        )}
        {actionResult && (
          <Alert
            variant={actionResult.success ? "success" : "danger"}
            title={actionResult.message}
            isInline
            className="pf-v6-u-mb-md"
            actionClose={
              <Button
                variant="plain"
                onClick={() => setActionResult(null)}
                aria-label="Close"
              />
            }
          />
        )}
        {isLoading ? (
          <Bullseye>
            <Spinner size="xl" />
          </Bullseye>
        ) : (
          <Table aria-label="Certificate requests table">
            <Thead>
              <Tr>
                <Th>Request ID</Th>
                <Th>Type</Th>
                <Th>Status</Th>
                <Th>Certificate ID</Th>
                <Th>Result</Th>
                <Th>Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {requests.length === 0 ? (
                <Tr>
                  <Td colSpan={6}>
                    <Content component="small">
                      No certificate requests found.
                    </Content>
                  </Td>
                </Tr>
              ) : (
                requests.map((req) => (
                  <Tr key={req.requestID}>
                    <Td>{req.requestID}</Td>
                    <Td>{req.certRequestType ?? req.requestType}</Td>
                    <Td>
                      <StatusLabel status={req.requestStatus} />
                    </Td>
                    <Td>{req.certId ?? "—"}</Td>
                    <Td>
                      <StatusLabel status={req.operationResult} />
                    </Td>
                    <Td>
                      {req.requestStatus === "pending" && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setReviewId(req.requestID)}
                        >
                          Review
                        </Button>
                      )}
                    </Td>
                  </Tr>
                ))
              )}
            </Tbody>
          </Table>
        )}
      </PageSection>

      {reviewId && (
        <ReviewModal
          requestId={reviewId}
          onClose={() => setReviewId(null)}
          onResult={setActionResult}
        />
      )}
    </>
  );
};

interface ReviewModalProps {
  requestId: string;
  onClose: () => void;
  onResult: (result: { success: boolean; message: string }) => void;
}

const ReviewModal: React.FC<ReviewModalProps> = ({
  requestId,
  onClose,
  onResult,
}) => {
  const {
    data: review,
    isLoading,
    error,
  } = useGetRequestReviewQuery(requestId);
  const [approveRequest, { isLoading: approving }] =
    useApproveRequestMutation();
  const [rejectRequest, { isLoading: rejecting }] = useRejectRequestMutation();

  const handleAction = async (action: "approve" | "reject") => {
    if (!review) return;
    const mutation = action === "approve" ? approveRequest : rejectRequest;
    try {
      await mutation({ requestId, body: review }).unwrap();
      onResult({
        success: true,
        message: `Request ${requestId} ${action === "approve" ? "approved" : "rejected"} successfully.`,
      });
      onClose();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "data" in err
          ? JSON.stringify((err as { data: unknown }).data)
          : `Failed to ${action} request.`;
      onResult({ success: false, message: msg });
      onClose();
    }
  };

  const busy = approving || rejecting;

  return (
    <Modal isOpen onClose={onClose} variant="medium">
      <ModalHeader title={`Review Request ${requestId}`} />
      <ModalBody>
        {error && (
          <Alert
            variant="danger"
            title="Failed to load request details."
            isInline
          />
        )}
        {isLoading ? (
          <Bullseye>
            <Spinner size="lg" />
          </Bullseye>
        ) : review ? (
          <DescriptionList isHorizontal>
            <DescriptionListGroup>
              <DescriptionListTerm>Profile</DescriptionListTerm>
              <DescriptionListDescription>
                <Label isCompact color="blue">
                  {review.ProfileID}
                </Label>{" "}
                {review.profileName}
              </DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>Description</DescriptionListTerm>
              <DescriptionListDescription>
                {review.profileDescription}
              </DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>Status</DescriptionListTerm>
              <DescriptionListDescription>
                <StatusLabel status={review.requestStatus} />
              </DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>Created</DescriptionListTerm>
              <DescriptionListDescription>
                {review.requestCreationTime}
              </DescriptionListDescription>
            </DescriptionListGroup>
            {review.Input?.map((input) =>
              input.Attribute?.filter(
                (a) => a.Value && a.name !== "cert_request",
              ).map((attr) => (
                <DescriptionListGroup key={attr.name}>
                  <DescriptionListTerm>
                    {attr.Descriptor?.Description ?? attr.name}
                  </DescriptionListTerm>
                  <DescriptionListDescription>
                    {attr.Value}
                  </DescriptionListDescription>
                </DescriptionListGroup>
              )),
            )}
          </DescriptionList>
        ) : null}
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          onClick={() => handleAction("approve")}
          isLoading={approving}
          isDisabled={busy || !review}
        >
          Approve
        </Button>
        <Button
          variant="danger"
          onClick={() => handleAction("reject")}
          isLoading={rejecting}
          isDisabled={busy || !review}
        >
          Reject
        </Button>
        <Button variant="link" onClick={onClose} isDisabled={busy}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export default Requests;
