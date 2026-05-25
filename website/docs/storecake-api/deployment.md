---
sidebar_position: 10
title: Triển khai
---

# Triển khai

`builderx_api` được triển khai bằng **Ansible** với Elixir release đóng gói trong image Docker. Playbook nằm ở `ansible/`.

## Các môi trường

| Môi trường | Đối tượng | Inventory |
| --- | --- | --- |
| Local | Dev cá nhân | `docker-compose.yml` |
| Staging | QA team | `ansible/inventory.yaml` (group `store_staging_*`) |
| Production | Khách hàng | `ansible/inventory.yaml` (group `store_prod_*`) |

## Artifact build

- `Dockerfile` multi-stage:
  1. Build `mix release` với `MIX_ENV=prod`.
  2. Copy release sang image runtime gọn nhẹ.
- FE nội bộ ở `assets/` được build trong stage `:assets` (`npm ci && npm run deploy`) trước khi Elixir compile.

Kiểm tra build local:

```bash
make build
```

## Lệnh deploy (Makefile)

| Lệnh | Mô tả |
| --- | --- |
| `make deploy` | Deploy backend + publish consumer. |
| `make deploy-backend` | Chỉ deploy backend. |
| `make deploy-worker` | Deploy nhóm worker (cron, consumer). |
| `make deploy-publish-consumer` | Deploy publish consumer (kênh publish landing). |
| `make deploy-staging` | Deploy stack staging. |

Mỗi lệnh map tới:

```bash
ansible-playbook -i ansible/inventory.yaml ansible/<playbook>.yaml
```

## Hotfix

Khi cần ship fix khẩn:

```bash
# Kiểm tra những gì sẽ thay đổi
make hotfix-status

# Apply HEAD của branch hiện tại
make hotfix-head

# Cho staging
make hotfix-staging-status
make hotfix-staging-head
```

> Playbook hotfix giả định fix đã được merge vào `master` (prod) hoặc `develop` (staging).

## Migration khi deploy

- Sau khi release lên server, chạy migration:

  ```bash
  make migrate
  # tương đương: docker compose exec builderx_api mix ecto.migrate -r BuilderxApi.Citus
  ```

- Repo Postgres thường cũng cần migrate:

  ```bash
  docker compose exec builderx_api mix ecto.migrate -r BuilderxApi.Repo
  ```

- Migration schema chạy trên bảng lớn của prod nên thực hiện ngoài giờ cao điểm và thông báo ops trước.

## Restart / Reload

- Elixir release hỗ trợ hot reload qua RPC, nhưng team thường `docker compose restart builderx_api` cho an toàn.
- Service worker / consumer nên restart từng node để không gián đoạn indexing.

## Smoke test sau deploy

- `GET /healthz` trả 200.
- Đăng nhập trên staging `builderx_spa`.
- Tạo đơn test, kiểm tra event chạy qua `Rabbit.IndexingConsumer`.
- Sentry không nổi spike error trong 10 phút.

## Rollback

- CI giữ image trước với tag `:previous`.
- Các bước:
  1. SSH vào server.
  2. Đổi tag image về `:previous`.
  3. `docker compose up -d builderx_api`.
  4. Chạy lại smoke test.
- Hoàn tác migration có rủi ro — thường ship migration sửa lỗi thay vì `ecto.rollback` trên prod.

## CI/CD pipeline

1. Push branch → CI chạy `mix test` + lint.
2. Merge `develop` → CI build image staging và chạy `make deploy-staging` (nếu enable).
3. Merge `master` → CI build image prod và đánh tag.
4. Operator chạy `make deploy` (manual gate).
5. Theo dõi Sentry và Grafana trong một giờ.

## Monitoring khi vận hành

- **Sentry** — project `builderx-api`.
- **Grafana / Prometheus** — metric host + Postgres + Rabbit.
- **Phoenix LiveDashboard** — `/dashboard`, chỉ super-admin.
- **Log** — gom qua ELK / Loki tuỳ env.

## Best practice

- **Không** sửa DB prod trực tiếp. Mọi thay đổi data phải đi qua module context (mix task hoặc IEx RPC).
- Hot-fix data: viết script `mix run priv/scripts/<name>.exs`, qua code review, chạy có lock.
- Trước khi `make deploy`: đảm bảo `master` là commit muốn deploy và đã `git pull`.
- Không chạy hai lệnh deploy song song trên cùng cluster.
