---
sidebar_position: 2
title: Kiến trúc
---

# Architecture

Tài liệu này mô tả tổng thể cách `builderx_spa` được tổ chức và cách nó tương tác với hệ thống backend.

## Bức tranh tổng quan

```
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
                    │   subdomain proxy +  │  │  (Storecake Phoenix)  │
                    │   HTML render        │  └──────────────────────┘
                    └──────────┬───────────┘            ▲
                               │                        │
                               ▼                        │
                     ┌──────────────────┐   landing_page_backend
                     │  builderx_api    │   (Webcake API)
                     └──────────────────┘
```

* Trình duyệt nhận `index.html` hoặc `index_themes.html` từ Express, bootstrap Vue 3 SPA.
* SPA gọi API qua `axios` (xem [`src/api/`](api-layer.md)) và mở Phoenix Channel để nhận event realtime (publish trạng thái build, notification, AI page-generation progress…).
* Express layer chỉ làm mỏng: serve static, parse subdomain (storefront vs admin), set cookie/token.

## Phân lớp trong `src/`

```
src/
├── main.js                 # Bootstrap Vue + plugin
├── App.vue                 # Root
├── router/                 # Vue Router + guards (auth, site, feature flag)
├── stores/                 # Pinia stores (state global)
├── api/                    # Tầng gọi REST/HTTP (axios)
├── views/                  # Page-level components (gắn vào route)
├── components/             # UI component
│   ├── design/             # Wrapper Ant Design Vue + UI kit
│   ├── editor/             # Editor V1
│   ├── editor_v2/          # Editor V2 (recommend)
│   ├── dashboard/
│   ├── layout/
│   └── common/
├── composable/             # Composition API helper (useXxx)
├── lib/                    # Util thuần (không gắn Vue context)
├── utils/                  # Helper format/string/date/…
├── plugins/                # Cài plugin Vue (sentry, i18n, ant-design, …)
├── i18n/                   # Locale & cấu hình vue-i18n
├── statics/                # Hằng số, mock data
├── style/                  # SCSS chung
├── measure/                # Đo lường perf, telemetry client
├── assets/                 # Asset bundle vào build
└── common/                 # Module dùng chung cross-feature
```

### Quy ước tổ chức code

* **Page-level** đặt ở `src/views/<feature>/`. Một số trang lớn (Dashboard, Sites, Editor) đặt thẳng `views/<Name>.vue`.
* **Component dùng chung** ở `src/components/`. Component theo feature (`editor_v2`, `dashboard`, `editor`, `ppd-editor`…) được đặt theo thư mục feature.
* **API client** import từ `@/api/<feature>Api.js`. Tránh import trực tiếp `axios` trong view, đi qua `baseApi.js`/`axiosClient.js` để có chung interceptor (auth header, 401 handler, log).
* **Store** import qua `@/stores/<store>`. Hạn chế truy cập store chéo nhau ở trong store, ưu tiên gọi từ view/composable.
* **Composable** chỉ chứa logic, không render. Đặt ở `src/composable/use*.js`.
* **Lib vs utils**: `lib/` cho module phức tạp (parser, serializer, runtime). `utils/` cho helper đơn lẻ.

## Vai trò các tầng

### View ↔ Store ↔ API

```
View (Vue Component)
  ├─ gọi store action  → store cập nhật state
  └─ gọi @/api/xxxApi  → trả Promise → store / view dùng
```

Quy tắc:

* View **không** tự `axios.get`. Lấy dữ liệu thông qua API module.
* Store **chỉ** giữ state shared giữa nhiều view. Trạng thái cục bộ trang giữ trong `data()` của view.
* Component leaf nhận `props`, emit event → không gọi API trực tiếp (ngoại trừ vài widget chuyên biệt).

### Router & subdomain

* `src/router/index.js` cấu hình routes; `src/router/guards/` chứa middleware (auth guard, site guard, feature guard).
* Trên server, `server.js` dựa vào subdomain (`admin.*`, `storefront.*`) để chọn HTML entry (`index.html` vs `index_themes.html`) và truyền config vào window.

### Editor

Editor có 2 thế hệ tồn tại song song:

1. **Editor V1** (`src/components/editor`, `src/views/Editor.vue`): legacy, vẫn được dùng cho site cũ.
2. **Editor V2** (`src/components/editor_v2`, `src/views/EditorV2.vue`): version đang phát triển. Có hệ trait/schema riêng (`schemas/`), hỗ trợ AI page generation.

Chi tiết kiến trúc Editor V2 đã có tài liệu riêng:

* [Editor V2 — Architecture](editor-v2/01-architecture.md)
* [Editor V2 — Rendering](editor-v2/02-rendering.md)
* [Editor V2 — Drag & Drop](editor-v2/03-drag-drop.md)
* [Editor V2 — Traits & Schema](editor-v2/07-traits-and-data.md)
* [Editor V2 — AI Page Generation](editor-v2/09-ai-page-generation.md)

### Realtime

* Phoenix Socket khởi tạo trong plugin / composable (xem `src/plugins`).
* Channel topic theo `site:<site_id>` hoặc `account:<account_id>`. Backend ở `builderx_api/lib/builderx_api_web/channels/`.
* Sự kiện chính: build progress, indexing progress, AI job progress, push notification realtime.

## Build & SSR pipeline

1. `npm run build:client` → Vite build ra `dist/client/`.
2. `server.js` mount `dist/client/` làm static, đọc `index.html` template, inject env (site, feature flag) trước khi serve.
3. Khi deploy (Ansible), bản build sẽ được upload lên server cùng `server.js`; service Node chạy phía sau Nginx.

## Phụ thuộc giữa các repo

* `builderx_spa` cần `builderx_api` (auth, site, product, order, theme, …).
* Một số chức năng (landing publish, asset upload nâng cao, page builder content) đi qua `landing_page_backend`.
* Component nhúng theme (preview themes) đôi khi gọi cả 2 backend → đặt URL trong env.

## Tham chiếu

* [Project structure](project-structure.md)
* [API layer](api-layer.md)
* [Stores](stores.md)
* [Routing & Guards](routing.md)
* [Build & Deploy](build-and-deploy.md)
* [Environment variables](environment.md)
