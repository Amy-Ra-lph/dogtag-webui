import React from "react";
import { Nav, NavExpandable, NavItem, NavList } from "@patternfly/react-core";
import { NavLink, useLocation } from "react-router";
import { navigationRoutes } from "./NavRoutes";

const Navigation: React.FC = () => {
  const location = useLocation();

  return (
    <Nav>
      <NavList>
        {navigationRoutes.map((section) => {
          const isSectionActive = section.items.some(
            (item) => location.pathname === item.path,
          );

          return (
            <NavExpandable
              key={section.label}
              title={section.label}
              isActive={isSectionActive}
              isExpanded={isSectionActive}
            >
              {section.items.map((item) => (
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
