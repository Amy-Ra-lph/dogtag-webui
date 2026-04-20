# Dogtag PKI WebUI

A modern web interface for [Dogtag PKI](https://www.dogtagpki.org/) (upstream of Red Hat Certificate System), built with React, PatternFly 6, and Redux Toolkit.

## Prerequisites

- Node.js >= 18
- A running Dogtag CA instance (default: `https://localhost:8443`)

## Quick Start

```bash
# Install dependencies
npm install

# Start the dev server (proxies /ca/rest/* to localhost:8443)
npm run dev

# Open http://localhost:5173 in your browser
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server with API proxy |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint |
| `npm run test` | Run tests with Vitest |

## Production Deployment

```bash
npm run build
```

The built files are output to `dist/`. Serve them with any static file server. An example nginx configuration is provided in `nginx/dogtag-webui.conf` that:

- Serves the SPA with HTML5 history fallback
- Proxies `/ca/rest/` requests to the Dogtag CA backend on port 8443

## Project Structure

```
src/
  app/            App shell (PatternFly Page layout)
  components/     Shared UI components (breadcrumbs, etc.)
  navigation/     Route definitions and sidebar nav
  pages/          Page-level components (one per nav section)
  services/       RTK Query API definitions (Dogtag REST)
  store/          Redux store configuration and typed hooks
nginx/            Example reverse proxy config
```

## Architecture

- **API Layer**: RTK Query (`dogtagApi.ts`) targets the Dogtag CA REST API at `/ca/rest/`. In development, Vite proxies these requests to `https://localhost:8443`.
- **State**: Redux Toolkit store with RTK Query middleware for caching, invalidation, and polling.
- **Routing**: React Router v7 with PatternFly `Page` / `PageSidebar` layout.
- **Styling**: PatternFly 6 component library -- no custom CSS framework needed.
