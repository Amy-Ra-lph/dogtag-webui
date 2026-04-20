import React from "react";
import { Label } from "@patternfly/react-core";

interface StatusLabelProps {
  status: string;
}

const colorMap: Record<string, "green" | "blue" | "orange" | "red" | "grey"> = {
  VALID: "green",
  complete: "green",
  approved: "green",
  Enabled: "green",
  enabled: "green",
  REVOKED: "red",
  rejected: "red",
  EXPIRED: "orange",
  pending: "blue",
  canceled: "grey",
};

const StatusLabel: React.FC<StatusLabelProps> = ({ status }) => {
  const color = colorMap[status] ?? "grey";
  return <Label color={color}>{status}</Label>;
};

export default StatusLabel;
