---
sidebar_position: 10
title: Deployment
---

# Deployment

`builderx_api` is deployed via **Ansible** with Elixir releases packaged as Docker images. Playbooks live in `ansible/`.

## Environments

| Env | Audience | Inventory |
| --- | --- | --- |
| Local | Personal dev | `docker-compose.yml` |
| Staging | QA team | `ansible/inventory.yaml` (group `store_staging_*`) |
| Production | Customers | `ansible/inventory.yaml` (group `store_prod_*`) |

## Build artifact

- The `Dockerfile` is multi-stage:
  1. Build `mix release` with `MIX_ENV=prod`.
  2. Copy the release into a slim runtime image.
- The in-repo `assets/` FE is built in the `:assets` stage (`npm ci && npm run deploy`) before Elixir compiles.

Local sanity check:

```bash
make build
```

## Deploy targets (Makefile)

| Target | Description |
| --- | --- |
| `make deploy` | Backend + publish consumer. |
| `make deploy-backend` | Backend only. |
| `make deploy-worker` | Worker fleet (cron, consumers). |
| `make deploy-publish-consumer` | Publish consumer (landing publish channel). |
| `make deploy-staging` | Staging stack. |

These all expand to:

```bash
ansible-playbook -i ansible/inventory.yaml ansible/<playbook>.yaml
```

## Hotfix

When shipping a fast fix:

```bash
# What will change
make hotfix-status

# Apply HEAD of current branch
make hotfix-head

# Staging equivalents
make hotfix-staging-status
make hotfix-staging-head
```

> Hotfix playbooks assume the fix is already merged into `master` (prod) or `develop` (staging).

## Migrations on deploy

- After the release lands on the server, run:

  ```bash
  make migrate
  # which runs: docker compose exec builderx_api mix ecto.migrate -r BuilderxApi.Citus
  ```

- The non-Citus Repo also needs migrating:

  ```bash
  docker compose exec builderx_api mix ecto.migrate -r BuilderxApi.Repo
  ```

- Schema migrations against large prod tables go out of peak hours and ops gets a heads-up.

## Restart / Reload

- Elixir releases support hot-reload via RPC, but most deploys restart the container (`docker compose restart builderx_api`).
- Worker / consumer services should restart one node at a time to avoid pausing indexing.

## Post-deploy smoke test

- `GET /healthz` returns 200.
- Sign in on staging `builderx_spa`.
- Place a test order and watch the event hit `Rabbit.IndexingConsumer`.
- Sentry stays quiet for the next 10 minutes.

## Rollback

- CI keeps the previous image under `:previous`.
- Steps:
  1. SSH to the server.
  2. Re-tag the image to `:previous`.
  3. `docker compose up -d builderx_api`.
  4. Re-run the smoke test.
- Reverting migrations is risky — typically we ship a corrective migration instead of running `ecto.rollback` in prod.

## CI/CD pipeline

1. Push branch → CI runs `mix test` + lint.
2. Merge `develop` → CI builds a staging image and runs `make deploy-staging` (if enabled).
3. Merge `master` → CI builds prod image and tags it.
4. An operator runs `make deploy` (manual gate).
5. Sentry and Grafana watched for an hour.

## Operational monitoring

- **Sentry** — project `builderx-api`.
- **Grafana / Prometheus** — host + Postgres + Rabbit metrics.
- **Phoenix LiveDashboard** — `/dashboard` (super-admin only).
- **Logs** — aggregated via ELK / Loki (per env).

## Best practices

- **Never** edit prod DB directly. Run data changes through a context module (mix task or IEx RPC).
- For hotfix data work, write a `mix run priv/scripts/<name>.exs`, review it, run with a lock.
- Before `make deploy`: ensure `master` is the commit you want and `git pull` is current.
- Don't run two deploys concurrently against the same cluster.
