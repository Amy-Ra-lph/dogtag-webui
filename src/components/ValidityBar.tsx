import React from "react";
import { Progress, ProgressMeasureLocation } from "@patternfly/react-core";

interface ValidityBarProps {
  notBefore: number;
  notAfter: number;
}

const ValidityBar: React.FC<ValidityBarProps> = ({ notBefore, notAfter }) => {
  const now = Date.now();
  const total = notAfter - notBefore;
  const elapsed = now - notBefore;

  if (total <= 0) return null;

  const pct = Math.max(0, Math.min(100, (elapsed / total) * 100));
  const expired = now > notAfter;
  const variant = expired ? "danger" : pct > 80 ? "warning" : undefined;

  return (
    <Progress
      value={pct}
      measureLocation={ProgressMeasureLocation.none}
      variant={variant}
      aria-label="Certificate validity"
      style={{ minWidth: 80 }}
    />
  );
};

export default ValidityBar;
