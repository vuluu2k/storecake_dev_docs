---
sidebar_position: 10
title: Deployment
---

# Deployment

`landing_page_backend` is deployed with **Ansible** + Docker images. The cluster is split per role (backend API, render service, builder, editor, cart, tikpage, worker) so rollouts can be staged.

## Environments

| Env | Audience | Inventory group |
| --- | --- | --- |
| Local | Personal dev | `docker-compose.yml` |
| Staging | QA team | `ansible/inventory.yaml` (staging group) |
| Production | Customers | `ansible/inventory.yaml` (prod role groups) |

## Build artifact

- Multi-stage Dockerfile:
  1. Build FE assets (`cd assets && npm ci && npm run deploy`).
  2. `mix release` with `MIX_ENV=prod`.
  3. Copy the release into a runtime image (`elixir:1.12.2-alpine`-ish + libvips + ffmpeg).
- Local sanity:

  ```bash
  make build
  ```

## Deploy targets

| Target | Description |
| --- | --- |
| `make deploy-backend` | Deploy the backend API. |
| `make deploy-render` | Deploy the render service (landing publish). |
| `make deploy-builder` | Deploy the builder service. |
| `make deploy-editor` | Deploy the editor service. |
| `make deploy-cart` | Deploy the cart service. |
| `make deploy-tikpage` | Deploy the TikTok landing service. |
| `make deploy-worker` | Deploy workers (Oban, Rabbit consumers). |
| `make deploy-staging` | Deploy the staging stack. |

Each target runs `ansible-playbook -i ansible/inventory.yaml ansible/<playbook>.yml`.

## Migrations on deploy

- After the release lands, run:

  ```bash
  make migrate
  # = docker compose exec landing-page mix ecto.migrate
  ```

- For tables under logical replication: re-run `make add-table-replica` when needed. See [Database](./database.md).

## Hotfix

```bash
make hotfix-status   # show what will change
make hotfix-head     # apply HEAD
```

> The fix must already be on `master` (prod) or `develop` (staging).

## Restart / Reload

- Default: `docker compose restart landing-page` (or the corresponding role).
- For graceful restart, use `:rpc.call/4` or `docker compose exec landing-page bin/landing_page stop && start`.

## Smoke test

- `GET /healthz` → 200.
- Public API: `POST /api/v1/forms/<id>/submissions` — submit a test lead.
- Open the builder, edit a page, watch Oban dashboard for backlog.
- Sentry quiet for the next 10 minutes.

## Rollback

- CI keeps a `:previous` image tag.
- SSH to the server, swap the tag, `docker compose up -d`.
- For migration-related issues: usually roll back code only; migrations rarely roll back cleanly.

## Logical replication during DB changes

Per [Database](./database.md):

1. Run the migration on the primary.
2. If the table is replicated, run `make add-table-replica table=<name>`.
3. Verify rows + replication lag on the replica.

## Monitoring

- **Sentry** — project `webcake-api`.
- **Grafana** — host metrics + Postgres + Oban dashboard.
- **Telebot alert** — `TELEBOT_ALERT_TOKEN` for critical alerts (stuck job, queue lag).
- **Phoenix LiveDashboard** — `/dashboard` (super-admin only).

## Best practices

- Deploy worker + backend separately so a bad worker can be rolled back without bouncing API.
- Don't roll multiple roles on the same cluster at the same time.
- Run `make deploy-worker` **after** `make deploy-backend` so workers pick up the new job format.
- All prod data fixes go through Elixir scripts (`mix run priv/scripts/<task>.exs`) with code review — never raw `psql`.
