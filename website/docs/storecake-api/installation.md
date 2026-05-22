---
sidebar_position: 2
title: Cài đặt
---

# Cài đặt

Quy trình khuyến nghị là dùng Docker để mọi người trong team đều dùng cùng phiên bản Elixir, Postgres và các service hỗ trợ. Cài Elixir native cũng được nếu bạn thích.

## Yêu cầu chuẩn bị

- Docker và Docker Compose (khuyến nghị), **hoặc** Elixir 1.12.x · Erlang/OTP 24 · Node.js 14+ đã cài trên máy.
- Quyền truy cập tổ chức `pancake-vn` trên GitHub.

## 1. Clone repository

```bash
git clone git@github.com:pancake-vn/builderx_api.git
cd builderx_api
```

## 2. Build Docker image

```bash
make build
```

## 3. Chạy app ở chế độ dev (hot reload)

```bash
make dev
```

## 4. Mở shell bên trong container

```bash
make bash
```

Các bước còn lại thực hiện bên trong shell này.

## 5. Cài Elixir dependency và setup database

```bash
mix deps.get
mix ecto.setup
```

`mix ecto.setup` sẽ tạo database, chạy migration và seed dữ liệu khởi tạo.

## 6. Cài Node.js dependency cho `assets/`

```bash
cd assets
npm install
cd ..
```

## Kiểm tra setup

- Phoenix phải đang lắng nghe tại [http://localhost:4000](http://localhost:4000).
- Lệnh `mix phx.routes` liệt kê toàn bộ route đã đăng ký.
- Xem [Runbook](./run.md) cho các thao tác vận hành thường gặp (tạo tài khoản, reindex Elasticsearch, warm cache).
