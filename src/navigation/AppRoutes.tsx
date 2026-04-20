import React from "react";
import { Routes, Route } from "react-router";
// Pages
import Certificates from "src/pages/Certificates";
import CertificateDetail from "src/pages/CertificateDetail";
import Enroll from "src/pages/Enroll";
import Requests from "src/pages/Requests";
import Profiles from "src/pages/Profiles";
import ProfileEditor from "src/pages/ProfileEditor";
import Dashboard from "src/pages/Dashboard";
import Authorities from "src/pages/Authorities";
import Users from "src/pages/Users";
import Groups from "src/pages/Groups";
import Audit from "src/pages/Audit";
import CCCompliance from "src/pages/CCCompliance";

const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/certificates" element={<Certificates />} />
      <Route path="/certificates/:certId" element={<CertificateDetail />} />
      <Route path="/enroll" element={<Enroll />} />
      <Route path="/requests" element={<Requests />} />
      <Route path="/profiles" element={<Profiles />} />
      <Route path="/profiles/create" element={<ProfileEditor />} />
      <Route path="/profiles/edit/:profileId" element={<ProfileEditor />} />
      <Route path="/authorities" element={<Authorities />} />
      <Route path="/users" element={<Users />} />
      <Route path="/groups" element={<Groups />} />
      <Route path="/audit" element={<Audit />} />
      <Route path="/cc-compliance" element={<CCCompliance />} />
    </Routes>
  );
};

export default AppRoutes;
