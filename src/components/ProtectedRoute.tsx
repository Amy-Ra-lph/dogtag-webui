import React from "react";
import { Navigate } from "react-router";
import {
  Bullseye,
  Spinner,
  PageSection,
  Content,
} from "@patternfly/react-core";
import { useAppSelector } from "src/store/store";
import { hasAnyRole } from "src/auth/roles";

interface Props {
  children: React.ReactNode;
  requiredRoles?: string[];
}

const ProtectedRoute: React.FC<Props> = ({ children, requiredRoles }) => {
  const { user, checked } = useAppSelector((s) => s.auth);

  if (!checked) {
    return (
      <Bullseye>
        <Spinner size="xl" />
      </Bullseye>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRoles && !hasAnyRole(user, requiredRoles)) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Content component="h1">Access Denied</Content>
        <Content component="p">
          You do not have permission to view this page. Required role:{" "}
          {requiredRoles.join(" or ")}.
        </Content>
      </PageSection>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
