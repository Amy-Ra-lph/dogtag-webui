import React from "react";
import { Routes, Route } from "react-router";
import ProtectedRoute from "src/components/ProtectedRoute";
import { ROLE_ADMIN, ROLE_AGENT, ROLE_AUDITOR } from "src/auth/roles";
// Pages
import LoginPage from "src/pages/LoginPage";
import Dashboard from "src/pages/Dashboard";
import Certificates from "src/pages/Certificates";
import CertificateDetail from "src/pages/CertificateDetail";
import Enroll from "src/pages/Enroll";
import Requests from "src/pages/Requests";
import Profiles from "src/pages/Profiles";
import ProfileEditor from "src/pages/ProfileEditor";
import Authorities from "src/pages/Authorities";
import Users from "src/pages/Users";
import Groups from "src/pages/Groups";
import Audit from "src/pages/Audit";
import CCCompliance from "src/pages/CCCompliance";
import WorkloadIdentities from "src/pages/WorkloadIdentities";
import CodeSigning from "src/pages/CodeSigning";
import TrustChain from "src/pages/TrustChain";

const P: React.FC<{
  children: React.ReactNode;
  roles?: string[];
}> = ({ children, roles }) => (
  <ProtectedRoute requiredRoles={roles}>{children}</ProtectedRoute>
);

const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <P>
            <Dashboard />
          </P>
        }
      />
      <Route
        path="/certificates"
        element={
          <P>
            <Certificates />
          </P>
        }
      />
      <Route
        path="/certificates/:certId"
        element={
          <P>
            <CertificateDetail />
          </P>
        }
      />
      <Route
        path="/enroll"
        element={
          <P roles={[ROLE_ADMIN, ROLE_AGENT]}>
            <Enroll />
          </P>
        }
      />
      <Route
        path="/requests"
        element={
          <P roles={[ROLE_ADMIN, ROLE_AGENT]}>
            <Requests />
          </P>
        }
      />
      <Route
        path="/profiles"
        element={
          <P roles={[ROLE_ADMIN, ROLE_AGENT]}>
            <Profiles />
          </P>
        }
      />
      <Route
        path="/profiles/create"
        element={
          <P roles={[ROLE_ADMIN]}>
            <ProfileEditor />
          </P>
        }
      />
      <Route
        path="/profiles/edit/:profileId"
        element={
          <P roles={[ROLE_ADMIN]}>
            <ProfileEditor />
          </P>
        }
      />
      <Route
        path="/authorities"
        element={
          <P>
            <Authorities />
          </P>
        }
      />
      <Route
        path="/users"
        element={
          <P roles={[ROLE_ADMIN]}>
            <Users />
          </P>
        }
      />
      <Route
        path="/groups"
        element={
          <P roles={[ROLE_ADMIN]}>
            <Groups />
          </P>
        }
      />
      <Route
        path="/audit"
        element={
          <P roles={[ROLE_ADMIN, ROLE_AUDITOR]}>
            <Audit />
          </P>
        }
      />
      <Route
        path="/workload-identities"
        element={
          <P roles={[ROLE_ADMIN, ROLE_AGENT]}>
            <WorkloadIdentities />
          </P>
        }
      />
      <Route
        path="/code-signing"
        element={
          <P roles={[ROLE_ADMIN, ROLE_AUDITOR]}>
            <CodeSigning />
          </P>
        }
      />
      <Route
        path="/trust-chain"
        element={
          <P roles={[ROLE_ADMIN]}>
            <TrustChain />
          </P>
        }
      />
      <Route
        path="/cc-compliance"
        element={
          <P roles={[ROLE_ADMIN, ROLE_AUDITOR]}>
            <CCCompliance />
          </P>
        }
      />
    </Routes>
  );
};

export default AppRoutes;
