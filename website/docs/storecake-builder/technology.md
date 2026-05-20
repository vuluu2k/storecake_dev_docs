---
sidebar_position: 1
title: Technology
---

# Technology

**builderx_spa** is the web-based site builder that powers the Storecake editor. It is a Vue 3 single-page application backed by a small Express server that handles SSR-style entry, asset hosting, and a few proxied endpoints.

## Frontend stack

- **Vue 3** with the Options API as the primary authoring style.
- **Vite** for development and production bundling.
- **Pinia** for global state management.
- **Vue Router** for client-side routing.
- **TailwindCSS** for utility-first styling.
- **Ant Design Vue 3** as the base component library — wrapped under `@/components/design/*`.
- **CodeMirror 6** and **Monaco Editor** for in-browser code editing.
- **Quill** (rich text), **TinyMCE** (legacy rich text), **ApexCharts** (charts), **Phoenix Channels** (real-time), **Sentry** (error reporting).

## Backend (in-repo)

The repository ships a thin Node.js server used to host the built SPA and serve a few helper endpoints:

- **Node.js + Express** with subdomain routing.
- **Socket.io** for editor presence and live updates.
- **TinyMCE** assets bundled via `postinstall`.

The heavy lifting (data, auth, integrations) lives in [builderx_api](../storecake-api/technology.md).

## System requirements

- **Node.js** 18 LTS or newer (16 still works but is no longer recommended).
- **npm** ≥ 9 or **yarn** classic.
- **Docker** (optional) — provided for parity with the backend dev setup.

## Repository layout

```
builderx_spa/
├── server.js            # Express entry — serves the built SPA
├── src/                 # Vue 3 application source
│   ├── components/      # Shared components
│   │   └── design/      # Ant Design wrappers — import from here
│   ├── i18n/locales/    # Translation JSON, source language: vi
│   ├── stores/          # Pinia stores
│   └── router/          # Vue Router definitions
├── public/              # Static assets served as-is
├── dist/                # Build output (gitignored)
├── tailwind.config.cjs
├── vite.config.js
├── Makefile             # Docker shortcuts (make dev, make bash)
└── package.json
```
