---
sidebar_position: 2
title: Architecture
---

# Architecture

How `builderx_spa` is layered and how it talks to the rest of the platform.

## Big picture

```text
                ┌────────────────────────────────────────────────────────┐
                │                  Browser (Vue 3 SPA)                    │
                │                                                        │
                │ Pinia stores ── Vue Router ── Ant Design Vue + Tailwind │
                │       │              │                                  │
                │       ▼              ▼                                  │
                │ axios (src/api) ─── Phoenix Channels (realtime)         │
                └────────────┬────────────────────────┬──────────────────┘
                             │ HTTP/HTTPS             │ WS
                             ▼                        ▼
                    ┌──────────────────────┐  ┌──────────────────────┐
                    │   server.js (Express)│  │  builderx_api         │
                    │   subdomain proxy +  │  │  (Storecake backend)  │
                    │   HTML render        │  └──────────────────────┘
                    └──────────┬───────────┘
                               │
                               ▼
                     ┌──────────────────────┐
                     │ landing_page_backend │
                     │   (Webcake API)      │
                     └──────────────────────┘
```

- The browser receives `index.html` or `index_themes.html` from Express, bootstraps the Vue 3 SPA.
- The SPA calls REST endpoints via [`src/api/`](./api-layer.md) and opens Phoenix Channels for realtime (build progress, AI page generation, notifications).
- Express is a thin layer: serves static assets, parses subdomains (admin vs storefront), sets cookies / tokens.

## Layers inside `src/`

```text
src/
├── main.js                 # createApp + plugins + router + pinia
├── App.vue                 # Root
├── router/                 # Vue Router + guards (auth, site, feature flag)
├── stores/                 # Pinia stores
├── api/                    # axios HTTP layer
├── views/                  # Page-level components (route targets)
├── components/             # Component library
│   ├── design/             # Ant Design wrappers — import from here
│   ├── editor/             # Editor V1 (legacy)
│   ├── editor_v2/          # Editor V2 (preferred)
│   ├── dashboard/
│   ├── layout/
│   └── common/
├── composable/             # Composition helpers (useXxx)
├── lib/                    # Complex shared modules (parser, serializer,…)
├── utils/                  # Small helpers (string, date, format)
├── plugins/                # Vue plugins (sentry, antd, i18n,…)
├── i18n/                   # vue-i18n setup + locales/*.json
├── statics/                # Constants, enums, default data
├── style/                  # Shared SCSS, tailwind theme variables
├── measure/                # Perf marks, web vitals
├── assets/                 # Bundled assets
└── common/                 # Cross-feature modules
```

## Layering rules

| Layer | Rule |
| --- | --- |
| **View** | Does not call `axios` directly. Reads data from a store or calls `@/api/<feature>Api`. |
| **Store (Pinia)** | Holds state shared across views. Local UI state stays in the view's `data()`. |
| **API module** | Returns promises. Never mutates store state. |
| **Composable** | Pure logic, no rendering. Lives in `src/composable/use*.js`. |
| **Library vs utils** | `lib/` for richer modules (Editor parser/serializer). `utils/` for one-shot helpers. |

## Router & subdomain

- `src/router/index.js` declares routes; `src/router/guards/` holds middleware (auth, site, permission, feature flag).
- `server.js` looks at the subdomain (`admin.*`, `<store>.*`) to choose the right HTML entry (`index.html` vs `index_themes.html`) and inject env into `window`.

## Editor generations

Two editors coexist:

1. **Editor V1** — `src/components/editor`, `src/views/Editor.vue`. Legacy, still used for older sites.
2. **Editor V2** — `src/components/editor_v2`, `src/views/EditorV2.vue`. Trait/schema driven (`schemas/`), supports AI page generation.

Deep dives: [Editor V2 — Architecture](./editor-v2/01-architecture.md), [Rendering](./editor-v2/02-rendering.md), [Traits & Schema](./editor-v2/07-traits-and-data.md), [AI Page Generation](./editor-v2/09-ai-page-generation.md).

## Realtime

- A Phoenix Socket is created in `src/plugins` / a composable.
- Channel topics: `site:<site_id>`, `account:<account_id>`.
- Common events: build progress, indexing progress, AI job progress, push notifications.

## Build pipeline

1. `npm run build:client` → Vite outputs `dist/client/`.
2. `server.js` serves `dist/client/`, injects env into the HTML template before responding.
3. Ansible uploads the built bundle + `server.js` to servers; Node runs behind Nginx.

## Cross-repo dependencies

- `builderx_spa` requires `builderx_api` (auth, site, product, order, theme).
- Landing publishing, advanced asset upload, and page builder content go through `landing_page_backend`.

## Further reading

- [Project structure](./project-structure.md)
- [Routing & Guards](./routing.md)
- [Pinia stores](./stores.md)
- [API layer](./api-layer.md)
- [Build & Deploy](./build-and-deploy.md)
- [Environment variables](./environment.md)
