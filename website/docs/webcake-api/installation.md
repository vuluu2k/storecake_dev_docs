---
sidebar_position: 1
title: Cài đặt
---

# Cài đặt

Quy trình khuyến nghị là dùng Docker để mọi máy đều có cùng phiên bản Elixir, Postgres và các service phụ trợ.

## Yêu cầu chuẩn bị

- Docker và Docker Compose, **hoặc** Elixir 1.12.x · Erlang/OTP 24 · Node.js 14+ đã cài trên máy.
- Quyền truy cập tổ chức `pancake-vn` trên GitHub.

## 1. Clone repository

```bash
git clone git@github.com:pancake-vn/landing_page_backend.git
cd landing_page_backend
```

## 2. Build Docker image

```bash
docker compose build landing-page
```

## 3. Khởi động app

```bash
make app
# hoặc, để có hot reload khi dev:
make dev
```

## 4. Cài dependency và setup database

Mở shell trong container đang chạy:

```bash
make bash
```

Bên trong container:

```bash
mix deps.get
mix ecto.setup
```

`mix ecto.setup` sẽ tạo database, chạy migration và seed dữ liệu khởi tạo.

## 5. Cài Node.js dependency cho `assets/`

Vẫn bên trong container:

```bash
cd ./assets && npm install
```

## Kiểm tra setup

- Phoenix phải đang lắng nghe tại [http://localhost:4000](http://localhost:4000).
- Lệnh `mix phx.routes` liệt kê toàn bộ route đã đăng ký.
- Tail log từ máy host bằng `docker compose logs -f landing-page`.
