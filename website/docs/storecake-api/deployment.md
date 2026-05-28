---
sidebar_position: 10
title: Triển khai
---

# Deployment

`builderx_api` deploy bằng **Ansible** với release Elixir đóng gói Docker. Playbook đặt ở `ansible/`.

## Tổng quan môi trường

| Env         | Vai trò                              | Inventory                     |
| ----------- | ------------------------------------ | ----------------------------- |
| Local       | Dev cá nhân                          | `docker-compose.yml`          |
| Staging     | QA team test                         | `ansible/inventory.yaml` (group `store_staging_*`) |
| Production  | Phục vụ khách hàng                   | `ansible/inventory.yaml` (group `store_prod_*`)     |

## Build artifact

* Image Docker được build từ `Dockerfile` (multi-stage):
  1. Build `mix release` với MIX_ENV=prod.
  2. Copy release vào image runtime.
* Frontend nội bộ trong `assets/` được build trong stage `:assets` (`npm ci && npm run deploy`) trước khi compile Elixir.

Local build kiểm tra:

```bash
make build
```

## Lệnh deploy chính (Makefile)

| Lệnh                          | Mô tả                                                                 |
| ----------------------------- | --------------------------------------------------------------------- |
| `make deploy`                 | Deploy stack chính + publish consumer.                                |
| `make deploy-backend`         | Chỉ backend, không animation tool.                                    |
| `make deploy-worker`          | Deploy worker (cron, consumer).                                        |
| `make deploy-publish-consumer`| Deploy consumer publish (channel publish landing/page).               |
| `make deploy-staging`         | Deploy môi trường staging.                                            |

Ngầm gọi:

```bash
ansible-playbook -i ansible/inventory.yaml ansible/<playbook>.yaml
```

## Hotfix

Khi cần ship fix khẩn:

```bash
# Status hotfix (kiểm tra file thay đổi sẽ apply)
make hotfix-status

# Apply theo HEAD branch hiện tại
make hotfix-head

# Đối với staging
make hotfix-staging-status
make hotfix-staging-head
```

> Playbook hotfix giả định bạn đã merge fix vào nhánh `master` (hoặc `develop` cho staging) trước khi chạy.

## Migration khi deploy

* Sau khi release lên server, chạy migration:

  ```bash
  make migrate
  # ngầm: docker compose exec builderx_api mix ecto.migrate -r BuilderxApi.Citus
  ```

* Repo Postgres thường cũng cần migrate:

  ```bash
  docker compose exec builderx_api mix ecto.migrate -r BuilderxApi.Repo
  ```

* Với migration ảnh hưởng prod nặng (schema thay đổi bảng lớn): chạy ngoài giờ peak, thông báo team ops trước.

## Restart / Reload

* Release Elixir hỗ trợ hot reload qua RPC – tuy nhiên team thường chạy `docker compose restart builderx_api` cho an toàn.
* Worker / consumer service nên restart theo từng node để tránh ngắt indexing.

## Smoke test sau deploy

* `GET /healthz` trả 200.
* Đăng nhập 1 account thử ở `builderx_spa` staging.
* Tạo test order, kiểm tra event qua Rabbit (`Rabbit.IndexingConsumer` log).
* Sentry không có spike error mới sau 10 phút.

## Rollback

* Ansible giữ image trước qua tag `:previous` (do CI quản lý).
* Steps:
  1. SSH server, đổi tag image về `:previous`.
  2. `docker compose up -d builderx_api`.
  3. Kiểm tra log + smoke test lại.
* Nếu rollback đòi hỏi migration revert → cân nhắc kỹ. Một số migration không có `down` (data backfill). Thông thường chỉ rollback code, không rollback DB; data sửa trực tiếp bằng script.

## CI/CD pipeline (tổng quát)

1. Push branch → CI chạy `mix test` + lint.
2. Merge `develop` → CI build image staging → tự chạy `make deploy-staging` (nếu enable).
3. Merge `master` → CI build image prod, gắn tag.
4. Người trực deploy chạy `make deploy` (manual gate).
5. Sau deploy, theo dõi Sentry/Grafana 1 giờ.

## Monitoring khi vận hành

* **Sentry** – theo project `builderx-api`.
* **Grafana / Prometheus** – metric host + Postgres + Rabbit.
* **Phoenix LiveDashboard** – internal route (`/dashboard`), chỉ super-admin.
* **Log**: tập trung qua ELK/Loki (tuỳ env).

## Best practice

* **Không** edit DB trực tiếp ở prod. Mọi thay đổi data đi qua context Elixir (mix task hoặc iex RPC).
* Khi cần data hot-fix: viết script `mix run priv/scripts/<name>.exs`, code review, sau đó chạy có lock.
* Trước khi `make deploy`: đảm bảo `master` đang là commit muốn deploy, branch hiện tại đã `git pull`.
* Đừng chạy 2 lệnh deploy song song trên cùng cluster.
