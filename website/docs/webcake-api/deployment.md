---
sidebar_position: 10
title: Triển khai
---

# Deployment

`landing_page_backend` deploy bằng **Ansible**, image Docker. Cluster chia nhỏ theo vai trò (backend API, render service, builder, editor, cart, tikpage, worker) để rollout an toàn từng phần.

## Môi trường

| Env        | Mục đích                | Inventory group                                  |
| ---------- | ----------------------- | ------------------------------------------------ |
| Local      | Dev cá nhân             | `docker-compose.yml`                             |
| Staging    | QA team                  | `ansible/inventory.yaml` (group staging)         |
| Production | Khách hàng              | `ansible/inventory.yaml` (group prod theo role)  |

## Build artifact

* Dockerfile multi-stage:
  1. Build assets FE (`cd assets && npm ci && npm run deploy`).
  2. `mix release` với `MIX_ENV=prod`.
  3. Copy release sang runtime image (`elixir:1.12.2-alpine`-ish + libvips + ffmpeg).
* Local build kiểm tra:

  ```bash
  make build
  ```

## Lệnh deploy chính

| Target                    | Mô tả                                                     |
| ------------------------- | --------------------------------------------------------- |
| `make deploy-backend`     | Deploy backend API.                                       |
| `make deploy-render`      | Deploy render service (publish landing).                  |
| `make deploy-builder`     | Deploy builder service.                                   |
| `make deploy-editor`      | Deploy editor service.                                    |
| `make deploy-cart`        | Deploy cart service.                                      |
| `make deploy-tikpage`     | Deploy tikpage (TikTok landing).                          |
| `make deploy-worker`      | Deploy worker (Oban, Rabbit consumer).                    |
| `make deploy-staging`     | Deploy toàn bộ stack staging.                             |

Mỗi target gọi `ansible-playbook -i ansible/inventory.yaml ansible/<playbook>.yml`.

## Migration khi deploy

* Chạy migration sau khi release container:

  ```bash
  make migrate
  # ngầm: docker compose exec landing-page mix ecto.migrate
  ```

* Nếu migration thay đổi schema được publish (logical replication): refer [Database](database.md) – có thể cần `make add-table-replica` sau migration.

## Hotfix

```bash
# Diff sẽ apply
make hotfix-status

# Apply HEAD
make hotfix-head
```

> Hotfix giả định branch đã merge fix vào `master` (prod) hoặc `develop` (staging).

## Restart / Reload

* Thông thường `docker compose restart landing-page` (hoặc role tương ứng).
* Khi cần graceful: dùng `:rpc.call/4` hoặc `docker compose exec landing-page bin/landing_page stop && start` (release script).

## Smoke test

* `GET /healthz` → 200.
* Public API: `POST /api/v1/forms/<id>/submissions` test form submit.
* Đăng nhập builder, mở 1 page, verify Oban dashboard không pending dồn.
* Sentry không có spike error.

## Rollback

* CI giữ tag image `:previous`.
* SSH server, đổi tag, `docker compose up -d`.
* Nếu liên quan migration: thông thường giữ schema (chỉ rollback code). Migration đảo ngược phải có script `down/0` an toàn.

## Logical replication khi deploy DB change

Theo flow ở [Database](database.md):

1. Chạy migration trên primary.
2. Nếu bảng được replicate: chạy `make add-table-replica table=<name>` để đảm bảo replica sync.
3. Verify trên replica: số row, lag.

## Monitoring

* **Sentry** – project `webcake-api`.
* **Grafana** – host metric + Postgres + Oban dashboard.
* **Telebot alert** – `TELEBOT_ALERT_TOKEN` cảnh báo nghiêm trọng (job stuck, queue lag).
* **Phoenix LiveDashboard** – `/dashboard` (chỉ super-admin).

## Best practice

* Deploy worker và backend tách lần để dễ rollback nếu worker phình queue.
* Không deploy đồng thời nhiều role trên cùng cluster (tránh restart hết node một lúc).
* Đảm bảo `make deploy-worker` chạy sau khi `deploy-backend` để worker pick up format job mới.
* Mọi data-fix prod đi qua script Elixir + code review (`mix run priv/scripts/<task>.exs`), không sửa DB bằng `psql` thủ công.
