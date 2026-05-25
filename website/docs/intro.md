---
slug: /
sidebar_position: 1
title: Storecake dev docs
description: Developer documentation for the Webcake / Storecake platform.
---

# Storecake developer documentation

Welcome to the Storecake / Webcake developer handbook. This site collects setup guides, architecture overviews, runbooks, and conventions for the three repositories that power the platform.

## Repositories at a glance

| Project | Repository | Role | Stack |
| --- | --- | --- | --- |
| **builderx_spa** | `pancake-vn/builderx_spa` | Storefront SPA + admin dashboard, also hosts BuilderX visual editor. | Vue 3 + Vite, Express SSR shell, Pinia, Ant Design Vue, TailwindCSS |
| **builderx_api** | `pancake-vn/builderx_api` | Core Storecake backend — products, orders, accounts, integrations, real-time channels. | Phoenix (Elixir), PostgreSQL + Citus, Redis, RabbitMQ, Kafka, ElasticSearch, MongoDB |
| **landing_page_backend** | `pancake-vn/landing_page_backend` | Webcake API — landing page builder, publish, analytics, lead capture. | Phoenix (Elixir), PostgreSQL (logical replication), Oban, Redis, RabbitMQ, Kafka |

`builderx_spa` talks to both backends; `builderx_api` and `landing_page_backend` share Rabbit/Kafka clusters but own their own databases.

## Where to start

- **New on the team?** Read [Setup](./setup.md) for prerequisites, then [Git flow](./git-flow.md) for branching conventions.
- **Building the editor or admin UI?** Start with [Storecake Builder → Technology](./storecake-builder/technology.md) and [Architecture](./storecake-builder/architecture.md).
- **Backend (commerce)?** Start with [Storecake API → Technology](./storecake-api/technology.md), [Architecture](./storecake-api/architecture.md), [Domains](./storecake-api/domains.md).
- **Backend (landing/webcake)?** Start with [Webcake API → Technology](./webcake-api/technology.md), [Architecture](./webcake-api/architecture.md), [Workers & Queue](./webcake-api/workers.md).

## How each project section is organized

Every project section follows the same outline so you know exactly where to look:

1. **Technology** — stack overview, key dependencies, system requirements.
2. **Architecture** — layers, supervision tree, request lifecycle.
3. **Project structure** — directory map and naming conventions.
4. **Domain-specific guides** — stores / routing / database / workers / integrations, depending on the project.
5. **Installation** — clone, install, run locally with Docker or natively.
6. **Environment variables** — every key, what it powers, where it comes from.
7. **Build & Deploy** — release pipeline, Ansible, rollback.
8. **Runbook / Troubleshooting** — operational commands and known issues.

If a page is missing or out of date, click **Edit this page** at the bottom — improvements from anyone are welcome.
