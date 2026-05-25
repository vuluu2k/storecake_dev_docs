---
sidebar_position: 10
title: Triển khai
---

# Triển khai

`landing_page_backend` triển khai bằng **Ansible** + image Docker. Cluster tách theo vai trò (backend API, dịch vụ render, builder, editor, cart, tikpage, worker) để rollout từng phần an toàn.

## Môi trường

| Môi trường | Đối tượng | Inventory |
| --- | --- | --- |
| Local | Dev cá nhân | `docker-compose.yml` |
| Staging | QA team | `ansible/inventory.yaml` (group staging) |
| Production | Khách hàng | `ansible/inventory.yaml` (group prod theo vai trò) |

## Artifact build

- Dockerfile multi-stage:
  1. Build asset FE (`cd assets && npm ci && npm run deploy`).
  2. `mix release` với `MIX_ENV=prod`.
  3. Copy release sang image runtime (`elixir:1.12.2-alpine` kèm libvips + ffmpeg).
- Build local kiểm thử:

  ```bash
  make build
  ```

## Lệnh deploy

| Target | Mô tả |
| --- | --- |
| `make deploy-backend` | Deploy backend API. |
| `make deploy-render` | Deploy dịch vụ render (publish landing). |
| `make deploy-builder` | Deploy builder service. |
| `make deploy-editor` | Deploy editor service. |
| `make deploy-cart` | Deploy cart service. |
| `make deploy-tikpage` | Deploy dịch vụ TikTok landing. |
| `make deploy-worker` | Deploy worker (Oban, consumer Rabbit). |
| `make deploy-staging` | Deploy stack staging. |

Mỗi target chạy `ansible-playbook -i ansible/inventory.yaml ansible/<playbook>.yml`.

## Migration khi deploy

- Sau khi container có release mới, chạy:

  ```bash
  make migrate
  # = docker compose exec landing-page mix ecto.migrate
  ```

- Nếu bảng nằm trong logical replication: chạy lại `make add-table-replica` khi cần. Xem [Cơ sở dữ liệu](./database.md).

## Hotfix

```bash
make hotfix-status   # xem những gì sẽ thay đổi
make hotfix-head     # apply HEAD
```

> Fix cần đã được merge vào `master` (prod) hoặc `develop` (staging).

## Restart / Reload

- Mặc định: `docker compose restart landing-page` (hoặc vai trò tương ứng).
- Cần graceful: dùng `:rpc.call/4` hoặc `docker compose exec landing-page bin/landing_page stop && start`.

## Smoke test

- `GET /healthz` → 200.
- Public API: `POST /api/v1/forms/<id>/submissions` — gửi thử một lead.
- Mở builder, sửa một trang, theo dõi Oban dashboard xem có backlog không.
- Sentry không nổi event mới trong 10 phút.

## Rollback

- CI giữ tag `:previous` cho image.
- SSH vào server, đổi tag, `docker compose up -d`.
- Với vấn đề liên quan migration: thường chỉ rollback code; migration ít khi rollback sạch.

## Logical replication trong các thay đổi DB

Theo [Cơ sở dữ liệu](./database.md):

1. Chạy migration trên primary.
2. Nếu bảng đang được replicate, chạy `make add-table-replica table=<name>`.
3. Verify số dòng + độ lag trên replica.

## Monitoring

- **Sentry** — project `webcake-api`.
- **Grafana** — metric host + Postgres + dashboard Oban.
- **Telebot alert** — `TELEBOT_ALERT_TOKEN` cho cảnh báo quan trọng (job kẹt, queue lag).
- **Phoenix LiveDashboard** — `/dashboard`, chỉ super-admin.

## Best practice

- Deploy worker và backend tách lần để có thể rollback worker mà không phải bounce API.
- Không cùng lúc deploy nhiều vai trò trên cùng cluster.
- Chạy `make deploy-worker` **sau** `make deploy-backend` để worker bắt format job mới.
- Mọi data-fix prod đi qua script Elixir (`mix run priv/scripts/<task>.exs`) có code review — không sửa trực tiếp bằng `psql`.
