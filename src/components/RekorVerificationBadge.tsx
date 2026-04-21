import React from "react";
import { Label, Tooltip } from "@patternfly/react-core";

interface RekorVerificationBadgeProps {
  logIndex: number;
  uuid: string;
}

const RekorVerificationBadge: React.FC<RekorVerificationBadgeProps> = ({
  logIndex,
  uuid,
}) => {
  return (
    <Tooltip content={`Log index: ${logIndex} | UUID: ${uuid}`}>
      <Label color="green" isCompact>
        Verified #{logIndex}
      </Label>
    </Tooltip>
  );
};

export default RekorVerificationBadge;
