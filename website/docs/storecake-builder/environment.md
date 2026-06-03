---
sidebar_position: 9
title: Biến môi trường
---

# Environment variables

Cấu hình runtime của `builderx_spa` tách 2 phần:

* **Client (Vite)** – mọi biến phải prefix `VITE_*` để được expose qua `import.meta.env`.
* **Server (`server.js`)** – đọc bằng `process.env` qua `dotenv`.

File mẫu: `.env.development` (đã commit) – dùng làm reference. File local thực tế là `.env` (gitignored).

## Khởi tạo

```bash
cp .env.development .env
# chỉnh sửa lại URL backend, client id phù hợp môi trường local
```

## Client env (`VITE_*`)

| Key                                  | Mô tả                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `VITE_BUILDERX_SPA_URL`              | URL SPA hiện tại (CORS, redirect callback).                                                            |
| `VITE_BUILDERX_API_URL`              | URL `builderx_api` (Phoenix). Phải reachable từ browser khi dev.                                       |
| `VITE_BUILDERX_SPA_AFFILIATE_URL`    | Subdomain affiliate (`affiliate.localhost:5173`) để test luồng affiliate.                              |
| `VITE_LANDING_PAGE_API_URL`          | URL public của `landing_page_backend`.                                                                 |
| `VITE_LANDING_PREVIEW_URL`           | URL preview landing page (render service).                                                             |
| `VITE_LANDING_PAGE_BUILDER_URL`      | URL builder landing trên môi trường tương ứng.                                                          |
| `VITE_PANCAKEID_CLIENT_ID` / `_SECRET` | Pancake ID OAuth client. Lấy từ admin Pancake.                                                       |
| `VITE_PANCAKE_AUTH_URL`              | OAuth domain VN (`https://account.pancake.vn`).                                                        |
| `VITE_PANCAKE_AUTH_URL_INTERNATIONAL`| OAuth domain quốc tế (`https://account.pancake.biz`).                                                  |
| `VITE_GOOGLE_CLIENT_ID` / `_API_KEY` | Google OAuth + API (Drive, Sheets, Picker).                                                            |
| `VITE_DROPBOX_APP_KEY`               | Dropbox chooser.                                                                                       |
| `VITE_DRIBBBLE_CLIENT_ID`            | Dribbble integration (asset picker).                                                                   |
| `VITE_VIMEO_API_KEY`                 | Vimeo metadata.                                                                                        |
| `VITE_INSTAGRAM_CLIENT_ID`           | Instagram graph login.                                                                                 |
| `VITE_FACEBOOK_CLIENT_ID`            | Facebook login & graph.                                                                                |
| `VITE_DEVIANT_ART_CLIENT_ID`         | Asset picker DeviantArt.                                                                               |
| `VITE_STRIPE_PK`                     | Stripe publishable key (test/prod).                                                                    |
| `VITE_SLACK_CLIENT_ID`               | Slack notification integration.                                                                        |
| `VITE_PANCAKE_SECRET_KEY`            | Secret dùng cho signed flow nội bộ. Tuyệt đối **không** commit prod key.                               |
| `VITE_SAPO_CLIENT_ID`                | Tích hợp Sapo.                                                                                         |
| `VITE_HARAVAN_CLIENT_ID`             | Tích hợp Haravan.                                                                                      |
| `VITE_SHOPIFY_CLIENT_ID` / `_SECRET_KEY` | Tích hợp Shopify (chỉ test trong sandbox; prod managed riêng).                                     |
| `VITE_LANDING_PAGE_BACKEND_URL`      | URL backend dùng phía server (server.js → backend), trỏ vào container `landing-page` khi chạy docker. |
| `VITE_LANDING_GOOGLE_CLIENT_ID`      | OAuth client riêng cho luồng landing.                                                                  |
| `VITE_LANDING_SLACK_CLIENT_ID`       | Slack client riêng cho landing.                                                                        |

> Mọi biến `VITE_*` sẽ được build vào bundle client → **không đặt secret thực sự** (dù `VITE_PANCAKE_SECRET_KEY` đang tồn tại, nó chỉ dùng cho non-critical signing và sẽ thay bằng cơ chế server-side trong roadmap).

## Server env (`server.js`)

| Key                       | Mô tả                                                                                          |
| ------------------------- | ---------------------------------------------------------------------------------------------- |
| `NODE_ENV`                | `development` / `production`. Quyết định cache asset, log level.                               |
| `JWT_KEY`                 | Secret ký token nội bộ cho cookie. Phải đồng bộ giữa replicas.                                 |
| `PANCAKE_AUTH_URL`        | Endpoint Pancake auth khi server gọi qua (server-side OAuth exchange).                          |
| `BUILDERX_API_URL`        | URL `builderx_api` từ phía server (container) – thường `http://host.docker.internal:24679`.   |

## Khi thêm env mới

1. Bổ sung mẫu vào `.env.development` (giữ giá trị rỗng hoặc placeholder, không secret thực).
2. Cập nhật bảng trên + ghi rõ ai cấp giá trị (vd "ops team", "tự generate", "công khai").
3. Đảm bảo `vite.config.js` hoặc `server.js` đọc đúng key.
4. Cập nhật secret thực vào Ansible/Vault (deployment side).

## Pitfalls

* **Đổi env không hot reload**: phải dừng Vite, đặt lại `.env`, chạy `npm run dev` lại.
* **Biến không `VITE_*`** sẽ không xuất hiện ở `import.meta.env` ⇒ nếu thiếu, check prefix.
* Dùng `import.meta.env.MODE` (`development` / `production`) thay vì so sánh `NODE_ENV` ở phía client.
* Tránh log toàn bộ `import.meta.env` ra console (có client id ngoài) – đã có ESLint rule cảnh báo.
