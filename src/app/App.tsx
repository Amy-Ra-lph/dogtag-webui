import React from "react";
// PatternFly
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
} from "@patternfly/react-core";
import { Label } from "@patternfly/react-core";
// Icons
import { KeyIcon, UserIcon } from "@patternfly/react-icons";
// Navigation
import Navigation from "src/navigation/Navigation";
import AppRoutes from "src/navigation/AppRoutes";
import { useGetAccountInfoQuery } from "src/services/dogtagApi";

const App: React.FC = () => {
  const pageId = "primary-app-container";
  const { data: account } = useGetAccountInfoQuery();

  const isAgent = account?.Roles?.includes("Certificate Manager Agents");
  const isAdmin = account?.Roles?.includes("Administrators");

  const skipToContent = (event: React.MouseEvent) => {
    event.preventDefault();
    const primaryContentContainer = document.getElementById(pageId);
    if (primaryContentContainer) {
      primaryContentContainer.focus();
    }
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
          {account && (
            <>
              <ToolbarItem>
                <UserIcon className="pf-v6-u-mr-xs" />
                <Content component="small" className="pf-v6-u-display-inline">
                  {account.FullName}
                </Content>
              </ToolbarItem>
              {isAdmin && (
                <ToolbarItem>
                  <Label color="purple" isCompact>
                    Admin
                  </Label>
                </ToolbarItem>
              )}
              {isAgent && (
                <ToolbarItem>
                  <Label color="blue" isCompact>
                    Agent
                  </Label>
                </ToolbarItem>
              )}
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
      sidebar={Sidebar}
      isManagedSidebar={true}
      skipToContent={PageSkipToContent}
      isContentFilled
    >
      <AppRoutes />
    </Page>
  );
};

export default App;
