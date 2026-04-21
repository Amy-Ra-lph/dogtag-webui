import React from "react";
import "@patternfly/react-core/dist/styles/base.css";
import {
  Masthead,
  MastheadLogo,
  MastheadContent,
  MastheadMain,
  MastheadToggle,
  MastheadBrand,
  Page,
  PageSidebar,
  PageSidebarBody,
  PageToggleButton,
  SkipToContent,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
  Content,
  Button,
  Label,
} from "@patternfly/react-core";
import { KeyIcon, UserIcon } from "@patternfly/react-icons";
import { useLocation } from "react-router";
import Navigation from "src/navigation/Navigation";
import AppRoutes from "src/navigation/AppRoutes";
import { useAppSelector, useAppDispatch } from "src/store/store";
import { checkSession, logoutUser } from "src/store/authSlice";
import { hasRole, ROLE_ADMIN, ROLE_AGENT, ROLE_AUDITOR } from "src/auth/roles";

const App: React.FC = () => {
  const pageId = "primary-app-container";
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((s) => s.auth);
  const location = useLocation();
  const isLoginPage = location.pathname === "/login";

  React.useEffect(() => {
    dispatch(checkSession());
  }, [dispatch]);

  const handleLogout = () => {
    dispatch(logoutUser());
  };

  const skipToContent = (event: React.MouseEvent) => {
    event.preventDefault();
    document.getElementById(pageId)?.focus();
  };

  const PageSkipToContent = (
    <SkipToContent onClick={skipToContent} href={`#${pageId}`}>
      Skip to Content
    </SkipToContent>
  );

  const headerToolbar = (
    <Toolbar id="toolbar" isStatic>
      <ToolbarContent>
        <ToolbarGroup
          variant="action-group-plain"
          align={{ default: "alignEnd" }}
          gap={{ default: "gapNone", md: "gapMd" }}
        >
          {user && (
            <>
              <ToolbarItem>
                <UserIcon className="pf-v6-u-mr-xs" />
                <Content component="small" className="pf-v6-u-display-inline">
                  {user.fullName}
                </Content>
              </ToolbarItem>
              {hasRole(user, ROLE_ADMIN) && (
                <ToolbarItem>
                  <Label color="purple" isCompact>
                    Admin
                  </Label>
                </ToolbarItem>
              )}
              {hasRole(user, ROLE_AGENT) && (
                <ToolbarItem>
                  <Label color="blue" isCompact>
                    Agent
                  </Label>
                </ToolbarItem>
              )}
              {hasRole(user, ROLE_AUDITOR) && (
                <ToolbarItem>
                  <Label color="teal" isCompact>
                    Auditor
                  </Label>
                </ToolbarItem>
              )}
              <ToolbarItem>
                <Button variant="link" onClick={handleLogout}>
                  Log out
                </Button>
              </ToolbarItem>
            </>
          )}
        </ToolbarGroup>
      </ToolbarContent>
    </Toolbar>
  );

  const Header = (
    <Masthead>
      <MastheadMain>
        <MastheadToggle>
          <PageToggleButton
            isHamburgerButton
            variant="plain"
            aria-label="Global navigation"
          />
        </MastheadToggle>
        <MastheadBrand>
          <MastheadLogo className="pf-v6-u-display-flex">
            <KeyIcon className="pf-v6-u-mr-sm" />
            <Content component="h3" className="pf-v6-u-my-auto">
              Dogtag PKI
            </Content>
          </MastheadLogo>
        </MastheadBrand>
      </MastheadMain>
      <MastheadContent>{headerToolbar}</MastheadContent>
    </Masthead>
  );

  const Sidebar = (
    <PageSidebar>
      <PageSidebarBody>
        <Navigation />
      </PageSidebarBody>
    </PageSidebar>
  );

  return (
    <Page
      mainContainerId={pageId}
      masthead={Header}
      sidebar={isLoginPage ? undefined : Sidebar}
      isManagedSidebar={!isLoginPage}
      skipToContent={PageSkipToContent}
      isContentFilled
    >
      <AppRoutes />
    </Page>
  );
};

export default App;
