import React from "react";
import { Alert } from "@patternfly/react-core";

interface ErrorBannerProps {
  message: string;
}

const ErrorBanner: React.FC<ErrorBannerProps> = ({ message }) => (
  <Alert variant="danger" title={message} className="pf-v6-u-mb-md" isInline />
);

export default ErrorBanner;
