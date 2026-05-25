---
sidebar_position: 2
title: Kiến trúc
---

# Kiến trúc

Mô tả cách `builderx_spa` được phân lớp và tương tác với phần còn lại của hệ thống.

## Bức tranh tổng quan

```text
                ┌────────────────────────────────────────────────────────┐
                │                  Trình duyệt (Vue 3 SPA)                │
                │                                                        │
                │ Pinia stores ── Vue Router ── Ant Design Vue + Tailwind │
                │       │              │                                  │
                │       ▼              ▼                                  │
                │ axios (src/api) ─── Phoenix Channels (realtime)         │
                └────────────┬────────────────────────┬──────────────────┘
                             │ HTTP/HTTPS             │ WebSocket
                             ▼                        ▼
                    ┌──────────────────────┐  ┌──────────────────────┐
                    │ server.js (Express)  │  │   builderx_api       │
                    │ subdomain proxy +    │  │   (Storefront API)   │
                    │ render HTML          │  └──────────────────────┘
                    └──────────┬───────────┘
                               │
                               ▼
                     ┌──────────────────────┐
                     │ landing_page_backend │
                     │   (Webcake API)      │
                     └──────────────────────┘
```

- Trình duyệt nhận `index.html` hoặc `index_themes.html` từ Express, sau đó khởi động Vue 3 SPA.
- SPA gọi REST qua [`src/api/`](./api-layer.md) và mở Phoenix Channels cho realtime (tiến trình build, AI sinh trang, thông báo đẩy).
- Lớp Express rất mỏng: phục vụ tài nguyên tĩnh, phân giải subdomain (admin và storefront), gắn cookie và token.

## Phân lớp trong `src/`

```text
src/
├── main.js                 # Khởi tạo: createApp + plugin + router + pinia
├── App.vue                 # Component gốc
├── router/                 # Vue Router + guard (auth, site, feature flag)
├── stores/                 # Các Pinia store
├── api/                    # Tầng HTTP dùng axios
├── views/                  # Component cấp trang (gắn với route)
├── components/             # Thư viện component
│   ├── design/             # Wrapper Ant Design — luôn import từ đây
│   ├── editor/             # Editor V1 (legacy)
│   ├── editor_v2/          # Editor V2 (phiên bản đang dùng)
│   ├── dashboard/
│   ├── layout/
│   └── common/
├── composable/             # Composable dùng chung (useXxx)
├── lib/                    # Module phức tạp (parser, serializer,…)
├── utils/                  # Helper nhỏ (chuỗi, ngày, định dạng)
├── plugins/                # Plugin Vue (sentry, antd, i18n,…)
├── i18n/                   # Cấu hình vue-i18n + tệp locale
├── statics/                # Hằng số, enum, dữ liệu mặc định
├── style/                  # SCSS dùng chung, biến theme tailwind
├── measure/                # Đo hiệu năng, web vitals
├── assets/                 # Tài nguyên đóng gói vào bundle
└── common/                 # Module dùng chung xuyên feature
```

## Quy tắc phân lớp

| Lớp | Quy tắc |
| --- | --- |
| **View** | Không gọi axios trực tiếp. Đọc dữ liệu từ store hoặc qua `@/api/<feature>Api`. |
| **Store (Pinia)** | Chứa state dùng chung giữa nhiều view. State cục bộ của một view giữ trong `data()` của view đó. |
| **Module API** | Trả về Promise. Không sửa state của store. |
| **Composable** | Logic thuần, không render. Đặt tại `src/composable/use*.js`. |
| **lib vs utils** | `lib/` cho module lớn (parser/serializer của Editor). `utils/` cho helper một lần dùng. |

## Router và subdomain

- `src/router/index.js` khai báo route; `src/router/guards/` chứa middleware (auth, site, permission, feature flag).
- `server.js` đọc subdomain (`admin.*`, `<store>.*`) để chọn HTML entry phù hợp (`index.html` so với `index_themes.html`) và truyền biến môi trường vào `window`.

## Hai thế hệ Editor

Hai editor đang tồn tại song song:

1. **Editor V1** — `src/components/editor`, `src/views/Editor.vue`. Bản cũ, vẫn dùng cho các site đã build từ trước.
2. **Editor V2** — `src/components/editor_v2`, `src/views/EditorV2.vue`. Dựa trên trait/schema (`schemas/`), hỗ trợ sinh trang bằng AI.

Tham khảo sâu hơn: [Editor V2 — Kiến trúc](./editor-v2/01-architecture.md), [Rendering](./editor-v2/02-rendering.md), [Trait & Schema](./editor-v2/07-traits-and-data.md), [Sinh trang AI](./editor-v2/09-ai-page-generation.md).

## Realtime

- Phoenix Socket được khởi tạo trong `src/plugins` hoặc qua một composable.
- Topic phổ biến: `site:<site_id>`, `account:<account_id>`.
- Sự kiện thường gặp: tiến trình build, tiến trình index, tiến trình job AI, thông báo đẩy.

## Build pipeline

1. `npm run build:client` — Vite xuất ra `dist/client/`.
2. `server.js` phục vụ `dist/client/`, chèn biến môi trường vào HTML trước khi trả về.
3. Ansible đẩy bundle build và `server.js` lên server; Node chạy phía sau Nginx.

## Phụ thuộc giữa các repo

- `builderx_spa` cần `builderx_api` (auth, site, sản phẩm, đơn hàng, theme).
- Luồng publish landing, upload tài nguyên nâng cao và nội dung page builder đi qua `landing_page_backend`.

## Tài liệu liên quan

- [Cấu trúc dự án](./project-structure.md)
- [Routing và Guard](./routing.md)
- [Pinia store](./stores.md)
- [Tầng API](./api-layer.md)
- [Build và Deploy](./build-and-deploy.md)
- [Biến môi trường](./environment.md)
