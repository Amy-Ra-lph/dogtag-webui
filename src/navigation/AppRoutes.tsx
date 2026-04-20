import React from "react";
import { Routes, Route, Navigate } from "react-router";
// Pages
import Certificates from "src/pages/Certificates";
import Requests from "src/pages/Requests";
import Profiles from "src/pages/Profiles";
import Authorities from "src/pages/Authorities";
import Users from "src/pages/Users";
import Groups from "src/pages/Groups";
import Audit from "src/pages/Audit";

const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/certificates" replace />} />
      <Route path="/certificates" element={<Certificates />} />
      <Route path="/requests" element={<Requests />} />
      <Route path="/profiles" element={<Profiles />} />
      <Route path="/authorities" element={<Authorities />} />
      <Route path="/users" element={<Users />} />
      <Route path="/groups" element={<Groups />} />
      <Route path="/audit" element={<Audit />} />
    </Routes>
  );
};

export default AppRoutes;
