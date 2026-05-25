---
sidebar_position: 3
title: Project structure
---

# Project structure

Directory map of `builderx_spa`. All paths are relative to the repository root.

## Repository root

```text
builderx_spa/
├── server.js                 # Express SSR/proxy entry
├── index.html                # SPA entry (admin)
├── index_themes.html         # SPA entry (storefront/theme preview)
├── vite.config.js
├── tailwind.config.cjs
├── postcss.config.cjs
├── package.json              # dev / lint / build / validate scripts
├── jsconfig.json             # IDE path alias
├── .eslintrc.cjs
├── .prettierrc.json
├── .husky/                   # Git hook (pre-commit lint-staged)
├── .vscode/                  # Recommended settings + tailwind.json
├── ansible/                  # Deploy playbooks
├── backend/                  # Helper endpoints outside Vite (oauth, token,…)
├── cert/                     # Local SSL (mkcert)
├── dist/                     # Build output (gitignored)
├── docs/                     # Internal docs (this site syncs from here)
├── mcp/                      # MCP config for AI dev tooling
├── public/                   # Static assets
├── schemas/                  # Editor V2 trait schemas
│   ├── elements/             # Per-element schemas
│   ├── elements.json         # Aggregate registry
│   └── trait-definitions.json
├── scripts/
│   ├── build-trait-schemas.mjs
│   └── validate-trait-schemas.mjs
├── src/                      # Source Vue 3
└── tinymce/                  # Copy from node_modules (postinstall)
```

## `src/`

```text
src/
├── main.js               # Bootstrap (createApp + plugins + router + pinia)
├── App.vue               # Root
├── api/                  # axios + per-feature API modules
├── assets/
├── common/
├── components/
├── composable/
├── i18n/                 # vue-i18n + locales/*.json
├── lib/
├── measure/              # Performance marks
├── plugins/              # Vue plugins (sentry, antd, i18n, gtm,…)
├── router/               # Routes + guards
├── statics/
├── stores/               # Pinia stores
├── style/                # Shared SCSS
├── utils/
└── views/                # Page-level components
```

## `src/views/` map by feature

| Path | Feature |
| --- | --- |
| `Dashboard.vue` | Main admin dashboard |
| `Sites.vue` / `site/` | Multi-site management |
| `Editor.vue` | Editor V1 |
| `EditorV2.vue` | Editor V2 (current) |
| `products/`, `Products.vue` | Products |
| `categories/` | Categories |
| `orders/` | Orders |
| `customers/`, `Customers.vue` | Customers |
| `discounts/`, `Discounts.vue` | Promotions |
| `payments/` | Payment methods |
| `analytic/`, `Analytics.vue` | Reports |
| `system_logs/`, `SystemLogs.vue` | Audit log |
| `blog/` | Blog |
| `app_store/`, `applications/` | App marketplace |
| `automations/` | Automation flows |
| `appointments/` | Bookings |
| `combo_products/`, `commissions/`, `affiliates/`, `user_affiliates/` | Advanced sales |
| `landing/`, `home_page/`, `Homepage.vue`, `store_home/` | Storefront UI |
| `sale_channels/`, `markets/`, `multilingual/`, `domains/`, `domain_and_seo/` | Distribution / SEO |
| `integrations/`, `partner_services/`, `services/`, `webcake/` | External integrations |
| `settings/` | Settings |
| `History.vue` | Activity log |
| `Albums.vue` | Media library |
| `Team.vue` | Team members |
| `Profile.vue` | User profile |
| `utms/` | UTM tracking |

## `src/components/`

```text
components/
├── common/        # Cross-feature components
├── dashboard/     # Dashboard widgets
├── design/        # Ant Design + UI kit wrappers — IMPORT FROM HERE
├── editor/        # Editor V1
├── editor_v2/     # Editor V2 (use for new features)
├── layout/        # Admin layout (sidebar, topbar, breadcrumb)
├── mixins/        # Vue mixins
├── ppd-editor/    # Product page detail editor
├── preview/       # Storefront preview render
├── skeleton/      # Loading skeletons
└── ui/            # Atomic UI (Button, Input,…)
```

> Always import shared UI through `@/components/design/<Name>.vue`. See [Components](./components.md).

## `src/stores/`

```text
stores/
├── editor.js        # Editor V1 store
├── editor/          # Editor V1 slices
├── editor_v2/       # Editor V2 slices (layers, traits, history, selection,…)
├── dashboard/
├── landing/
├── general.js       # App-level (theme, layout, global modals)
├── locale.js
├── payment/
├── preview.js
├── site.js          # Current site context
└── user.js          # Auth user, permissions
```

## `src/api/`

```text
api/
├── axiosClient.js          # axios instance (interceptors)
├── baseApi.js              # CRUD endpoint factory
├── inFlightPool.ts         # Dedupe identical inflight requests
├── editor_v2/              # Editor V2 endpoints
├── landing/                # Calls to landing_page_backend
├── productApi.js / siteApi.js / orderApi.js / …
```

See [API layer](./api-layer.md).

## `schemas/`

Source of truth for Editor V2 traits.

- `elements/` — per-element schema (one JSON per element).
- `elements.json` — aggregate registry (generated).
- `trait-definitions.json` — reusable trait definitions.
- `npm run validate:schemas` to validate; `npm run build:schemas` to rebuild the aggregate.

Deep dive: [Editor V2 — Traits & Schema](./editor-v2/07-traits-and-data.md).

## Naming conventions

- Components: `PascalCase.vue` (e.g. `ProductTable.vue`).
- JS files: `camelCase.js`; export plain objects/functions.
- Stores: `xxx.js` or `xxx/index.js`, ID kebab-case.
- Folders for features: `snake_case` (to match route slugs).
- Feature-local leaf components stay inside the feature folder; promote to `components/common/` only after 2+ reuses.
