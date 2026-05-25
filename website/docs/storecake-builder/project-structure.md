---
sidebar_position: 3
title: Cấu trúc dự án
---

# Cấu trúc dự án

Bản đồ thư mục của `builderx_spa`. Mọi đường dẫn tính tương đối từ thư mục gốc của repo.

## Thư mục gốc

```text
builderx_spa/
├── server.js                 # Express SSR/proxy
├── index.html                # Entry SPA cho admin
├── index_themes.html         # Entry SPA cho storefront/theme preview
├── vite.config.js
├── tailwind.config.cjs
├── postcss.config.cjs
├── package.json              # Script dev / lint / build / validate
├── jsconfig.json             # Alias path cho IDE
├── .eslintrc.cjs
├── .prettierrc.json
├── .husky/                   # Git hook pre-commit (lint-staged)
├── .vscode/                  # Settings khuyến nghị + tailwind.json
├── ansible/                  # Playbook deploy
├── backend/                  # Endpoint phụ trợ ngoài Vite (oauth, token,…)
├── cert/                     # Chứng chỉ SSL local (mkcert)
├── dist/                     # Output build (gitignored)
├── docs/                     # Tài liệu nội bộ (site này đồng bộ từ đây)
├── mcp/                      # Cấu hình MCP cho công cụ AI dev
├── public/                   # Tài nguyên tĩnh
├── schemas/                  # Trait schema cho Editor V2
│   ├── elements/             # Schema cho từng element
│   ├── elements.json         # Registry tổng hợp
│   └── trait-definitions.json
├── scripts/
│   ├── build-trait-schemas.mjs
│   └── validate-trait-schemas.mjs
├── src/                      # Mã nguồn Vue 3
└── tinymce/                  # Copy từ node_modules (postinstall)
```

## Thư mục `src/`

```text
src/
├── main.js               # Bootstrap (createApp + plugin + router + pinia)
├── App.vue               # Component gốc
├── api/                  # axios + module API theo feature
├── assets/
├── common/
├── components/
├── composable/
├── i18n/                 # vue-i18n + tệp locale
├── lib/
├── measure/              # Đo hiệu năng
├── plugins/              # Plugin Vue (sentry, antd, i18n, gtm,…)
├── router/               # Route + guard
├── statics/
├── stores/               # Pinia store
├── style/                # SCSS dùng chung
├── utils/
└── views/                # Component cấp trang
```

## `src/views/` theo nhóm tính năng

| Đường dẫn | Tính năng |
| --- | --- |
| `Dashboard.vue` | Trang chính của admin |
| `Sites.vue` / `site/` | Quản lý nhiều site |
| `Editor.vue` | Editor V1 |
| `EditorV2.vue` | Editor V2 (đang dùng) |
| `products/`, `Products.vue` | Sản phẩm |
| `categories/` | Danh mục |
| `orders/` | Đơn hàng |
| `customers/`, `Customers.vue` | Khách hàng |
| `discounts/`, `Discounts.vue` | Khuyến mãi |
| `payments/` | Phương thức thanh toán |
| `analytic/`, `Analytics.vue` | Báo cáo |
| `system_logs/`, `SystemLogs.vue` | Lịch sử thao tác |
| `blog/` | Bài viết |
| `app_store/`, `applications/` | Kho ứng dụng |
| `automations/` | Luồng tự động hoá |
| `appointments/` | Đặt lịch hẹn |
| `combo_products/`, `commissions/`, `affiliates/`, `user_affiliates/` | Bán hàng nâng cao |
| `landing/`, `home_page/`, `Homepage.vue`, `store_home/` | Giao diện storefront |
| `sale_channels/`, `markets/`, `multilingual/`, `domains/`, `domain_and_seo/` | Phân phối / SEO |
| `integrations/`, `partner_services/`, `services/`, `webcake/` | Tích hợp bên ngoài |
| `settings/` | Cài đặt |
| `History.vue` | Nhật ký hoạt động |
| `Albums.vue` | Thư viện media |
| `Team.vue` | Thành viên |
| `Profile.vue` | Hồ sơ |
| `utms/` | Theo dõi UTM |

## `src/components/`

```text
components/
├── common/        # Component dùng chéo nhiều feature
├── dashboard/     # Widget cho dashboard
├── design/        # Wrapper Ant Design + UI Kit — luôn import từ đây
├── editor/        # Editor V1
├── editor_v2/     # Editor V2 (dùng cho tính năng mới)
├── layout/        # Layout admin (sidebar, topbar, breadcrumb)
├── mixins/        # Mixin Vue
├── ppd-editor/    # Editor cho chi tiết sản phẩm
├── preview/       # Render preview storefront
├── skeleton/      # Loading skeleton
└── ui/            # Component nguyên tử (Button, Input,…)
```

> Luôn import UI dùng chung qua `@/components/design/<Name>.vue`. Xem [Components](./components.md).

## `src/stores/`

```text
stores/
├── editor.js        # Store cho Editor V1
├── editor/          # Slice phụ cho Editor V1
├── editor_v2/       # Slice Editor V2 (layers, traits, history, selection,…)
├── dashboard/
├── landing/
├── general.js       # State cấp app (theme, layout, modal toàn cục)
├── locale.js
├── payment/
├── preview.js
├── site.js          # Site đang chọn
└── user.js          # User đăng nhập, phân quyền
```

## `src/api/`

```text
api/
├── axiosClient.js          # axios instance (interceptor)
├── baseApi.js              # Factory cho endpoint CRUD
├── inFlightPool.ts         # Gộp request trùng đang chờ
├── editor_v2/              # Endpoint riêng cho Editor V2
├── landing/                # Gọi sang landing_page_backend
├── productApi.js / siteApi.js / orderApi.js / …
```

Xem [Tầng API](./api-layer.md).

## `schemas/`

Nơi định nghĩa trait Editor V2 (nguồn duy nhất):

- `elements/` — mỗi element một tệp JSON định nghĩa trait, mặc định, slot.
- `elements.json` — registry tổng hợp (được sinh ra).
- `trait-definitions.json` — định nghĩa trait dùng chung.
- `npm run validate:schemas` để kiểm tra; `npm run build:schemas` để sinh lại registry.

Tham khảo sâu: [Editor V2 — Trait và Schema](./editor-v2/07-traits-and-data.md).

## Quy ước đặt tên

- Component: `PascalCase.vue` (ví dụ `ProductTable.vue`).
- Tệp JavaScript: `camelCase.js`; export hàm hoặc object thuần.
- Store: đặt theo feature `xxx.js` hoặc `xxx/index.js`, ID kebab-case.
- Thư mục theo feature: `snake_case` để khớp với route slug.
- Component lá thuộc một feature đặt trong thư mục feature đó; chỉ chuyển lên `components/common/` khi được tái sử dụng ở ít nhất 2 feature.
