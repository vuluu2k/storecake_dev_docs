---
sidebar_position: 1
title: Công nghệ
---

# Technology

`builderx_spa` là **storefront SPA + dashboard quản trị** của hệ Storecake, đồng thời đóng vai trò editor (BuilderX) để khách hàng tự dựng site/landing. Repo bundle cả frontend (Vue 3) và một lớp **Express SSR/proxy** mỏng phục vụ HTML, subdomain routing và relay request về backend.

## Stack chính

### Frontend

| Lớp                  | Lib / Tool                                | Ghi chú |
| -------------------- | ----------------------------------------- | ------- |
| Framework            | **Vue 3** (chủ yếu Options API)           | Một số chỗ Composition API qua `<script setup>` cho component editor mới. |
| Build tool           | **Vite 3**                                | Config tại `vite.config.js`, plugin: `@vitejs/plugin-vue`, `vite-svg-loader`, `vite-plugin-mkcert` (https local). |
| State management     | **Pinia 2**                               | Store nằm ở `src/stores/`. |
| Routing              | **Vue Router 4**                          | `src/router/index.js`, guard ở `src/router/guards/`. |
| UI base              | **Ant Design Vue 3** + tuỳ biến nội bộ    | Lưu ý đang ở v3 (chưa migrate v4). |
| Design system nội bộ | **`webcake-ui-kit`**, **`webcake-data`**, `storecake_components` | Component import từ `@/components/design`. |
| CSS                  | **TailwindCSS 3** + SCSS                  | `tailwind.config.cjs`, `postcss.config.cjs`. |
| Icon                 | `@phosphor-icons/vue`, `@lucide/vue`, `vue-tabler-icons` | |
| Editor / RTE         | TinyMCE 6, Quill (`@vueup/vue-quill`), Monaco (`@guolao/vue-monaco-editor`), Ace, CodeMirror 6 | Editor V2 dùng kết hợp tuỳ context. |
| Realtime             | **Phoenix Channels** (`phoenix` JS)        | Kết nối WebSocket tới `builderx_api`. |
| Charts               | `vue3-apexcharts`                         | Dashboard analytics. |
| Drag & Drop / Tree   | `vuedraggable`, `he-tree-vue`, `vue-draggable-nested-tree` | Editor V2 builder. |
| i18n                 | **vue-i18n 9** + plugin `i18n-ally`        | Locale tại `src/i18n/locales/`. |
| Form / Validation    | tuỳ field, chủ yếu validate tay + Ant Design rules | |
| Payment              | `@stripe/stripe-js`, `vue-stripe-js`      | Stripe checkout / subscription. |
| Misc                 | `axios`, `lodash`, `dayjs`, `moment`, `uuid`, `mitt`, `crypto-js`, `jszip`, `xlsx-js-style` | |
| Error tracking       | `@sentry/vue`                             | DSN qua env. |

### Server-side wrapper

Repo có `server.js` (Express) phụ trách:

* Phục vụ `index.html` / `index_themes.html` đã build.
* Subdomain routing (`express-subdomain`) để phân biệt admin vs storefront.
* Forward một số endpoint nội bộ (token, cookie, asset).
* Set header bảo mật, CORS, parse cookie.

Stack thêm: `express`, `cors`, `cookie-parser`, `https`.

### Dev / Tooling

* `nodemon` cho watch (`npm run watch`).
* ESLint (`.eslintrc.cjs`) + Prettier + plugin `eslint-plugin-vue`, `eslint-plugin-i18n-json`.
* Husky + lint-staged (`npm run setup:husky`).
* MCP config (`.mcp.json`) phục vụ tooling AI nội bộ (tham khảo Editor V2).

## Yêu cầu hệ thống

* Node.js **16.x** (server.js dùng ESM với `"type": "module"`; khuyến nghị Node 18 LTS vẫn chạy được, nhưng team chuẩn 16 để khớp build).
* npm 8+ (đã commit `package-lock.json`).
* Docker (optional, dùng `make dev` cho môi trường gói gọn).
* Backend đi kèm: `builderx_api` (Storecake API) chạy local hoặc trỏ qua env. Có thể symlink `builderx_spa/builderx_api -> ../builderx_api`.

## Cấu trúc cao cấp

```
builderx_spa/
├── server.js                 # Express SSR/proxy
├── index.html / index_themes.html
├── vite.config.js
├── tailwind.config.cjs
├── postcss.config.cjs
├── src/                      # Toàn bộ frontend
├── schemas/                  # JSON schema cho trait Editor V2
├── scripts/                  # Build/validate trait schemas
├── public/                   # Static asset
├── backend/                  # Endpoint helper chạy ngoài Vite (auth, oauth)
├── tinymce/                  # Copy ra từ node_modules (postinstall hook)
├── ansible/                  # Deploy automation
├── mcp/                      # MCP server cấu hình local
└── docs/                     # Doc nội bộ (kết hợp với GitBook này)
```

Xem chi tiết tại [Project structure](project-structure.md) (mới).

## Tham chiếu

* [Installation](../installation.md)
* [Architecture](architecture.md)
* [Editor V2 — README](editor-v2/README.md)
* [Extension and rules](../extension-and-rules.md)
* [Docs research (Vue 3 + Pinia)](../docs-research.md)
