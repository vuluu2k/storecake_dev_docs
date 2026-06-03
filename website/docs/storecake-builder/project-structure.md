---
sidebar_position: 3
title: Cấu trúc dự án
---

# Project structure

Bản đồ thư mục `builderx_spa` để tra cứu nhanh khi onboarding. Đường dẫn tương đối tính từ root repo.

## Root

```
builderx_spa/
├── server.js                 # Express SSR/proxy entry
├── vite.config.js            # Vite config + alias @ -> src
├── tailwind.config.cjs       # Tailwind preset
├── postcss.config.cjs        # PostCSS (autoprefixer + tailwind)
├── package.json              # Scripts dev, lint, build, validate schema
├── jsconfig.json             # Path alias cho IDE
├── .eslintrc.cjs             # ESLint cho .js, .vue
├── .prettierrc.json
├── .husky/                   # Git hook (pre-commit lint-staged)
├── .vscode/                  # Recommended settings + tailwind.json
├── .github/                  # CI workflow
├── .agents/, .omc/, .claude/ # Tooling AI nội bộ (không liên quan runtime)
├── ansible/                  # Playbook deploy
├── backend/                  # Helper service ngoài SPA (oauth callback, token,…)
├── cert/                     # SSL local (https dev)
├── dist/                     # Build output (.gitignored ở normal flow)
├── docs/                     # Doc nội bộ (kèm GitBook docs này)
├── index.html                # Entry HTML cho admin SPA
├── index_themes.html         # Entry HTML cho storefront theme preview
├── mcp/                      # MCP tools cho dev AI
├── public/                   # Static (favicon, robots, ...)
├── schemas/                  # JSON schema trait Editor V2 (source of truth)
│   ├── elements/             # Per-element trait schema (.json)
│   ├── elements.json         # Aggregate elements
│   └── trait-definitions.json
├── scripts/
│   ├── build-trait-schemas.mjs
│   └── validate-trait-schemas.mjs
├── src/                      # Source Vue 3
└── tinymce/                  # Copy từ node_modules (postinstall)
```

## `src/`

```
src/
├── main.js               # Bootstrap (createApp + plugins + router + pinia)
├── App.vue               # Root component
├── api/                  # Axios client + per-feature API modules
├── assets/               # Asset import (font, image bundle)
├── common/               # Module dùng chung cross-feature
├── components/           # Component library (xem chi tiết bên dưới)
├── composable/           # Vue composables (useXxx)
├── i18n/                 # Cấu hình vue-i18n + locales/*.json
├── lib/                  # Logic phức tạp dùng chung (parser, serializer,…)
├── measure/              # Đo lường perf (perf marks, web vitals)
├── plugins/              # Cài plugin (sentry, antd, i18n, gtm, ...)
├── router/               # Vue Router + guards
├── statics/              # Hằng số, constant, enum, default data
├── stores/               # Pinia stores
├── style/                # SCSS chung, biến tailwind theme
├── utils/                # Helper đơn lẻ (string, date, http, file,...)
└── views/                # Page-level component, gắn vào route
```

## `src/views/` (mapping theo feature lớn)

| Thư mục/Tệp                | Feature                                                       |
| -------------------------- | ------------------------------------------------------------- |
| `Dashboard.vue`            | Trang dashboard chính của admin                                |
| `Sites.vue` / `site/`      | Quản lý site (multi-site)                                      |
| `Editor.vue`               | Editor V1                                                     |
| `EditorV2.vue`             | Editor V2 (mới)                                               |
| `products/`, `Products.vue`| Quản lý sản phẩm                                              |
| `categories/`              | Quản lý category                                              |
| `orders/`                  | Đơn hàng                                                      |
| `customers/`, `Customers.vue` | Khách hàng                                                  |
| `discounts/`, `Discounts.vue` | Khuyến mãi                                                  |
| `payments/`                | Phương thức thanh toán                                        |
| `analytic/`, `Analytics.vue`| Báo cáo                                                       |
| `system_logs/`, `SystemLogs.vue` | Audit log                                               |
| `blog/`                    | Blog management                                               |
| `app_store/`, `applications/`, `Applications.vue` | App marketplace                          |
| `automations/`             | Automation flow                                               |
| `appointments/`            | Lịch hẹn (service)                                            |
| `combo_products/`, `commissions/`, `affiliates/`, `user_affiliates/` | Bán hàng nâng cao            |
| `customers/`, `landing/`, `home_page/`, `Homepage.vue`, `store_home/` | Site UI               |
| `sale_channels/`, `markets/`, `multilingual/`, `domains/`, `domain_and_seo/` | Phân phối / SEO   |
| `integrations/`, `partner_services/`, `services/`, `webcake/`, `payments/` | Tích hợp ngoài     |
| `settings/`                | Cài đặt chung                                                 |
| `History.vue`              | Lịch sử thao tác                                              |
| `Albums.vue`               | Quản lý media                                                 |
| `Team.vue`                 | Thành viên                                                    |
| `Profile.vue`              | Hồ sơ                                                         |
| `utms/`                    | UTM tracking                                                  |

## `src/components/`

```
components/
├── common/        # Component cross-feature (modal base, table cell,...)
├── dashboard/     # Widget cho dashboard
├── design/        # Wrapper Ant Design + UI kit → IMPORT từ đây thay vì antdv
├── editor/        # Editor V1
├── editor_v2/     # Editor V2 (recommend cho tính năng mới)
├── layout/        # Layout admin (sidebar, topbar, breadcrumb, ...)
├── mixins/        # Vue mixin (option API)
├── ppd-editor/    # Editor đặc thù cho "ppd" (product page detail)
├── preview/       # Render preview site/landing
├── skeleton/      # Loading skeleton
└── ui/            # UI atom (Button, Input, ...) hỗ trợ design system
```

> **Quan trọng:** component dùng cho UI phải import qua `@/components/design/<Name>.vue`, không import trực tiếp từ `ant-design-vue`. Lý do: chuẩn hoá theme + dễ migrate khi đổi UI base. Xem [Components](../components.md).

## `src/stores/`

```
stores/
├── editor.js        # Store cho Editor V1
├── editor/          # Slice store cho Editor V1
├── editor_v2/       # Store Editor V2 (theo module: layers, traits, history,...)
├── dashboard/       # Store dashboard
├── landing/         # Landing builder store
├── general.js       # State chung (loading, locale, theme,...)
├── locale.js        # Locale store (vue-i18n integration)
├── payment/         # Stripe & payment state
├── preview.js       # Preview state cho editor → trang preview
├── site.js          # Site context hiện tại
└── user.js          # Auth user, permission
```

## `src/api/`

```
api/
├── axiosClient.js          # Cấu hình axios (timeout, interceptors)
├── baseApi.js              # Factory tạo CRUD endpoints
├── inFlightPool.ts          # Dedupe request trùng
├── editor_v2/              # API riêng Editor V2 (page, block, template,…)
├── landing/                # API gọi sang landing_page_backend
├── articleDashboardApi.js
├── blogDashboardApi.js
├── cmsAppApi.js
├── cmsFileApi.js
├── courseAppApi.js
├── customerDashboardApi.js
├── datagridApi.js
├── globalSourceApi.js
├── historyApi.js
├── organizationApi.js
├── pageApi.js
├── productApi.js
├── productDashboardApi.js
├── pwaApi.js
├── siteApi.js
├── siteDashboardApi.js
├── tagApi.js
└── templateApi.js
```

Chi tiết xem [API layer](api-layer.md).

## `schemas/`

Source-of-truth cho trait Editor V2:

* `elements/` – mỗi element có file JSON định nghĩa trait, default, slot.
* `elements.json` – aggregated registry, sinh bởi `npm run build:schemas`.
* `trait-definitions.json` – định nghĩa các trait dùng chung.
* `npm run validate:schemas` để kiểm tra schema hợp lệ.

Xem [Editor V2 — Traits & Schema](editor-v2/07-traits-and-data.md).

## Convention đặt tên

* File component: `PascalCase.vue`, ví dụ `ProductTable.vue`.
* File JS: `camelCase.js`. Module export theo dạng hàm/object thuần.
* Store file: theo feature `xxx.js` hoặc `xxx/index.js`.
* Folder feature snake_case (vd `editor_v2`, `home_page`) để khớp với route slug.
* Component leaf nội bộ feature đặt trong folder feature, không leak ra `components/common/` trừ khi tái sử dụng > 2 feature.
