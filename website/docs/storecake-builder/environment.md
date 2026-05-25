---
sidebar_position: 9
title: Biến môi trường
---

# Biến môi trường

Cấu hình runtime tách thành hai phần:

- **Phía client (Vite)** — biến cần prefix `VITE_*` để được expose qua `import.meta.env`.
- **Phía server (`server.js`)** — đọc bằng `process.env` qua `dotenv`.

Tệp `.env.development` đã commit như mẫu tham chiếu; tệp thực sự dùng ở máy là `.env` (gitignored).

## Khởi tạo

```bash
cp .env.development .env
# chỉnh lại URL backend và OAuth client cho môi trường của bạn
```

## Biến phía client (`VITE_*`)

| Khoá | Mục đích |
| --- | --- |
| `VITE_BUILDERX_SPA_URL` | URL của chính SPA — dùng cho CORS và redirect callback. |
| `VITE_BUILDERX_API_URL` | URL của `builderx_api`. |
| `VITE_BUILDERX_SPA_AFFILIATE_URL` | Subdomain affiliate (`affiliate.localhost:5173`). |
| `VITE_LANDING_PAGE_API_URL` | URL public của `landing_page_backend`. |
| `VITE_LANDING_PREVIEW_URL` | Dịch vụ render preview landing. |
| `VITE_LANDING_PAGE_BUILDER_URL` | URL của landing builder. |
| `VITE_PANCAKEID_CLIENT_ID` / `_SECRET` | OAuth client của Pancake ID. |
| `VITE_PANCAKE_AUTH_URL` | Tên miền OAuth VN (`https://account.pancake.vn`). |
| `VITE_PANCAKE_AUTH_URL_INTERNATIONAL` | Tên miền OAuth quốc tế (`https://account.pancake.biz`). |
| `VITE_GOOGLE_CLIENT_ID` / `_API_KEY` | OAuth Google + Drive / Sheets / Picker. |
| `VITE_DROPBOX_APP_KEY` | Dropbox chooser. |
| `VITE_DRIBBBLE_CLIENT_ID` | Picker tài nguyên Dribbble. |
| `VITE_VIMEO_API_KEY` | Vimeo metadata. |
| `VITE_INSTAGRAM_CLIENT_ID` | Instagram Graph login. |
| `VITE_FACEBOOK_CLIENT_ID` | Facebook login & Graph. |
| `VITE_DEVIANT_ART_CLIENT_ID` | Picker tài nguyên DeviantArt. |
| `VITE_STRIPE_PK` | Stripe publishable key. |
| `VITE_SLACK_CLIENT_ID` | Tích hợp thông báo Slack. |
| `VITE_PANCAKE_SECRET_KEY` | Khoá ký không nhạy cảm của Pancake. |
| `VITE_SAPO_CLIENT_ID` | Tích hợp Sapo. |
| `VITE_HARAVAN_CLIENT_ID` | Tích hợp Haravan. |
| `VITE_SHOPIFY_CLIENT_ID` / `_SECRET_KEY` | Tích hợp Shopify (sandbox). |
| `VITE_LANDING_PAGE_BACKEND_URL` | URL backend dùng phía server (`server.js`). |
| `VITE_LANDING_GOOGLE_CLIENT_ID` | OAuth client riêng cho luồng landing. |
| `VITE_LANDING_SLACK_CLIENT_ID` | Slack client riêng cho luồng landing. |

> Mọi biến `VITE_*` sẽ được nhúng vào bundle client. **Không** đặt secret thực sự nhạy cảm ở đây.

## Biến phía server (`server.js`)

| Khoá | Mục đích |
| --- | --- |
| `NODE_ENV` | `development` / `production`. Ảnh hưởng cache và mức log. |
| `JWT_KEY` | Secret ký cookie nội bộ. Phải đồng bộ giữa các replica. |
| `PANCAKE_AUTH_URL` | Endpoint Pancake auth phía server (đổi mã OAuth). |
| `BUILDERX_API_URL` | URL `builderx_api` nhìn từ trong container (thường `http://host.docker.internal:24679`). |

## Thêm biến mới

1. Bổ sung placeholder vào `.env.development` (không secret thật).
2. Cập nhật bảng ở trên kèm mô tả và nguồn cấp (ops, tự sinh, công khai,…).
3. Đảm bảo `vite.config.js` hoặc `server.js` có đọc biến đó.
4. Secret thật được nạp qua Ansible / vault, không qua tệp này.

## Sai sót thường gặp

- Thay đổi `.env` không nóng — phải dừng Vite, sửa `.env`, chạy `npm run dev` lại.
- Biến không có prefix `VITE_*` sẽ không xuất hiện ở `import.meta.env`.
- Dùng `import.meta.env.MODE` (`'development'` / `'production'`) thay vì so sánh `NODE_ENV` ở phía client.
- Đừng `console.log(import.meta.env)` — sẽ lộ các client id công khai mà bạn không muốn bị thu thập.
