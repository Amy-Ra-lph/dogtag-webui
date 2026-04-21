import React from "react";
import { Label, Tooltip } from "@patternfly/react-core";
import type { SpiffeId } from "src/types/spire";

interface SPIFFEIDBadgeProps {
  spiffeId: SpiffeId;
}

const SPIFFEIDBadge: React.FC<SPIFFEIDBadgeProps> = ({ spiffeId }) => {
  const [copied, setCopied] = React.useState(false);

  const handleClick = () => {
    navigator.clipboard.writeText(spiffeId.raw).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <Tooltip content={copied ? "Copied!" : "Click to copy"}>
      <Label
        color="blue"
        isCompact
        onClick={handleClick}
        style={{ cursor: "pointer", fontFamily: "monospace" }}
      >
        <span style={{ opacity: 0.6 }}>spiffe://{spiffeId.trustDomain}</span>
        <span style={{ fontWeight: 600 }}>{spiffeId.workloadPath}</span>
      </Label>
    </Tooltip>
  );
};

export default SPIFFEIDBadge;
