---
sidebar_position: 2
title: Cài đặt môi trường
---

# Setup

Bước chuẩn bị môi trường dev chung cho cả 3 repo (`builderx_spa`, `builderx_api`, `landing_page_backend`). Mỗi repo còn có file Installation riêng để hướng dẫn chi tiết hơn ở section của nó.

## 1. Yêu cầu hệ thống

| Tool              | Phiên bản gợi ý           | Ghi chú                                                |
| ----------------- | ------------------------- | ------------------------------------------------------ |
| macOS / Linux     | -                         | Windows nên dùng WSL2 vì cả 2 backend đều dùng Docker. |
| Docker Desktop    | >= 24                     | Bật `Use Rosetta` nếu là Mac Apple Silicon.            |
| Docker Compose    | v2 (built-in `docker compose`) | Một vài Makefile cũ vẫn gọi `docker-compose` (v1).|
| Git               | >= 2.30                   | Cấu hình SSH với GitHub.                               |
| Node.js           | 16.x (LTS) cho `builderx_spa`; 14+ cho phần `assets/` của 2 backend | Khuyến nghị dùng `nvm`. |
| npm / yarn        | npm 8+ hoặc yarn classic  | Repo `builderx_spa` đã commit `package-lock.json` → ưu tiên `npm`. |
| Elixir            | 1.12.2                    | Chỉ cần khi muốn chạy native (không qua Docker).       |
| Erlang/OTP        | 24+                       | Bundle theo Elixir.                                    |
| Make              | bất kỳ                    | Dùng cho các target `make dev`, `make bash`, ...       |
| Ansible (optional)| 2.10+                     | Chỉ cần khi deploy backend.                            |

## 2. Quyền truy cập

1. Được add vào org GitHub `pancake-vn` để clone các repo private.
2. SSH key đã đăng ký GitHub:

   ```bash
   ssh -T git@github.com
   ```
3. Token / secret cho service ngoài (Sentry, SMTP, AWS, Kafka cluster…): nhận từ team lead, đưa vào `.env` của repo tương ứng.

## 3. Cấu trúc thư mục đề nghị

Đặt cả 3 repo dưới cùng một parent để symlink (nhất là `builderx_spa/builderx_api -> ../builderx_api`) hoạt động:

```
~/web_cake/
├── builderx_spa/
├── builderx_api/
└── landing_page_backend/
```

## 4. Chuẩn bị `/etc/hosts`

Một số luồng (subdomain, oauth callback) cần hostname:

```
127.0.0.1   storecake.local
127.0.0.1   admin.storecake.local
127.0.0.1   webcake.local
127.0.0.1   *.webcake.local        # với CDN/landing publish
```

> macOS không match wildcard trong `/etc/hosts` – nếu cần wildcard hãy dùng `dnsmasq`.

## 5. Bước tiếp theo theo từng repo

* `builderx_spa` → xem [Installation](installation.md) ở section Storecake Builder.
* `builderx_api` → xem [Installation](installation-1.md) ở section Storecake Api.
* `landing_page_backend` → xem [Installation](webcake-api/installation.md) ở section Webcake api.

Sau khi từng repo chạy được, tham chiếu thêm:

* [Git flow](git-flow.md) – branching, commit convention.
* [Extension and rules](extension-and-rules.md) – cấu hình VSCode, ESLint, Husky, Tailwind.
