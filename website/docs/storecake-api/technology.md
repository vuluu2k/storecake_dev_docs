---
sidebar_position: 1
title: Technology
---

# Technology

**builderx_api** is the core backend that powers the Storecake builder. It is built on the [Phoenix Framework](https://www.phoenixframework.org/) (Elixir) and serves REST APIs, real-time channels, and background workers for the entire product surface — store data, orders, accounts, integrations, and search.

## Key capabilities

- RESTful APIs for products, orders, accounts, blogs, partner integrations, and more.
- Real-time messaging over **Phoenix Channels** (WebSocket).
- Multi-language, multi-site, and multi-tenant aware.
- Integrations with **Elasticsearch**, **Redis**, **RabbitMQ**, **Kafka**, **S3**, and SMTP providers.
- Role-based access control with OAuth and JWT authentication.
- CI/CD-friendly: Docker, Ansible playbooks, and a project-level Makefile.

## System requirements

| Component | Version |
| --- | --- |
| Elixir | ≥ 1.12.2 |
| Erlang / OTP | ≥ 24 |
| Node.js | ≥ 14 (for `assets/`) |
| PostgreSQL | Citus-flavored Postgres (recommended) |
| Docker · Docker Compose | Latest stable (recommended) |
| Redis · RabbitMQ · Elasticsearch | Required for the full feature set |

## Repository layout

```
builderx_api/
├── lib/
│   ├── builderx_api/          # Business logic — products, orders, accounts, integrations
│   └── builderx_api_web/      # Web layer — controllers, routers, channels, views, plugs
├── assets/                    # Frontend assets (Vue 3, Ant Design Vue, Webpack)
├── priv/repo/                 # Migrations and seeds
├── test/                      # Test suite
├── ansible/                   # Deployment playbooks
├── mix.exs
└── Makefile                   # Dev, build, and deploy shortcuts
```

## Makefile shortcuts

| Command | What it does |
| --- | --- |
| `make build` | Rebuild the Docker image. |
| `make app` | Run the app inside Docker. |
| `make services` | Start supporting services (Redis, RabbitMQ, …). |
| `make migrate` | Run database migrations inside the container. |
| `make deploy` | Deploy to production via Ansible. |
| `make dev` | Run in development mode with hot reload. |
| `make bash` | Open a shell inside the running container. |
