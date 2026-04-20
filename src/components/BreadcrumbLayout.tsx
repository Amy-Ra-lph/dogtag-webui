import React from "react";
import { Breadcrumb, BreadcrumbItem } from "@patternfly/react-core";
import { NavLink } from "react-router";

export interface BreadcrumbEntry {
  name: string;
  url: string;
}

interface BreadcrumbLayoutProps {
  items: BreadcrumbEntry[];
}

const BreadcrumbLayout: React.FC<BreadcrumbLayoutProps> = ({ items }) => {
  return (
    <Breadcrumb className="pf-v6-u-mb-md">
      <BreadcrumbItem>
        <NavLink to="/">Home</NavLink>
      </BreadcrumbItem>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <BreadcrumbItem key={item.url} isActive={isLast}>
            {isLast ? item.name : <NavLink to={item.url}>{item.name}</NavLink>}
          </BreadcrumbItem>
        );
      })}
    </Breadcrumb>
  );
};

export default BreadcrumbLayout;
