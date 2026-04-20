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
// Icons
import { KeyIcon } from "@patternfly/react-icons";
// Navigation
import Navigation from "src/navigation/Navigation";
import AppRoutes from "src/navigation/AppRoutes";

const App: React.FC = () => {
  const pageId = "primary-app-container";

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

  // Header toolbar (placeholder for future user menu / logout)
  const headerToolbar = (
    <Toolbar id="toolbar" isStatic>
      <ToolbarContent>
        <ToolbarGroup
          variant="action-group-plain"
          align={{ default: "alignEnd" }}
          gap={{ default: "gapNone", md: "gapMd" }}
        >
          <ToolbarItem>
            <Content component="small">Dogtag Certificate System</Content>
          </ToolbarItem>
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
