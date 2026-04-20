import React from "react";
import { Nav, NavExpandable, NavItem, NavList } from "@patternfly/react-core";
import { NavLink, useLocation } from "react-router";
import { navigationRoutes } from "./NavRoutes";
import { useAppSelector } from "src/store/store";
import { hasAnyRole } from "src/auth/roles";

const Navigation: React.FC = () => {
  const location = useLocation();
  const user = useAppSelector((s) => s.auth.user);

  return (
    <Nav>
      <NavList>
        {navigationRoutes.map((section) => {
          const visibleItems = section.items.filter(
            (item) =>
              !item.requiredRoles || hasAnyRole(user, item.requiredRoles),
          );
          if (visibleItems.length === 0) return null;

          const isSectionActive = visibleItems.some(
            (item) => location.pathname === item.path,
          );

          return (
            <NavExpandable
              key={section.label}
              title={section.label}
              isActive={isSectionActive}
              isExpanded={isSectionActive}
            >
              {visibleItems.map((item) => (
                <NavItem
                  key={item.group}
                  isActive={location.pathname === item.path}
                >
                  <NavLink to={item.path}>{item.label}</NavLink>
                </NavItem>
              ))}
            </NavExpandable>
          );
        })}
      </NavList>
    </Nav>
  );
};

export default Navigation;
