# Công nghệ

**builderx_api** là backend lõi cung cấp dữ liệu cho Storecake Builder. Service được viết trên [Phoenix Framework](https://www.phoenixframework.org/) (Elixir) và phục vụ REST API, real-time channel, cũng như background worker cho toàn bộ sản phẩm — dữ liệu shop, đơn hàng, tài khoản, các tích hợp và search.

## Khả năng chính

- REST API cho sản phẩm, đơn hàng, tài khoản, blog, các tích hợp đối tác,...
- Real-time qua **Phoenix Channels** (WebSocket).
- Hỗ trợ đa ngôn ngữ, multi-site, multi-tenant.
- Tích hợp **Elasticsearch**, **Redis**, **RabbitMQ**, **Kafka**, **S3**, SMTP.
- Phân quyền theo role với OAuth và JWT.
- Sẵn sàng CI/CD: Docker, Ansible playbook và Makefile ở cấp project.

## Yêu cầu hệ thống

| Thành phần | Phiên bản |
| --- | --- |
| Elixir | ≥ 1.12.2 |
| Erlang / OTP | ≥ 24 |
| Node.js | ≥ 14 (cho `assets/`) |
| PostgreSQL | Bản Citus của Postgres (khuyến nghị) |
| Docker · Docker Compose | Bản stable mới nhất (khuyến nghị) |
| Redis · RabbitMQ · Elasticsearch | Bắt buộc nếu muốn dùng đầy đủ tính năng |

## Cấu trúc repository

```
builderx_api/
├── lib/
│   ├── builderx_api/          # Logic nghiệp vụ — sản phẩm, đơn hàng, tài khoản, tích hợp
│   └── builderx_api_web/      # Web layer — controller, router, channel, view, plug
├── assets/                    # Frontend assets (Vue 3, Ant Design Vue, Webpack)
├── priv/repo/                 # Migration và seed
├── test/                      # Test suite
├── ansible/                   # Playbook deploy
├── mix.exs
└── Makefile                   # Shortcut dev, build, deploy
```

## Lệnh Makefile

| Lệnh | Tác dụng |
| --- | --- |
| `make build` | Rebuild Docker image. |
| `make app` | Chạy app trong Docker. |
| `make services` | Bật các service phụ trợ (Redis, RabbitMQ,...). |
| `make migrate` | Chạy migration database bên trong container. |
| `make deploy` | Deploy lên production qua Ansible. |
| `make dev` | Chạy ở chế độ dev với hot reload. |
| `make bash` | Mở shell trong container đang chạy. |
