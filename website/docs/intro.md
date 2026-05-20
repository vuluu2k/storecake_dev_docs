---
slug: /
sidebar_position: 1
title: Storecake dev docs
description: Developer documentation for the Webcake / Storecake platform.
---

# Storecake developer documentation

Welcome to the Storecake developer handbook. This site collects setup guides, conventions, and runbooks for the three repositories that power the platform, so any engineer can ramp up, contribute, and ship with confidence.

## Repositories at a glance

| Project | Repository | Role | Stack |
| --- | --- | --- | --- |
| **builderx_spa** | `pancake-vn/builderx_spa` | Web-based site builder — the editor UI that lets users design pages visually. | Vue 3 + Vite, Express SSR shell, Pinia, Ant Design Vue, TailwindCSS |
| **builderx_api** | `pancake-vn/builderx_api` | Core backend for the builder — products, orders, accounts, integrations, real-time channels. | Phoenix (Elixir), PostgreSQL/Citus, Redis, RabbitMQ, Elasticsearch |
| **landing_page_backend** | `pancake-vn/landing_page_backend` | Landing-page service used by published sites — public APIs, rendering, lead capture, and integrations. | Phoenix (Elixir), PostgreSQL, Redis, RabbitMQ |

## Where to start

- **Just joining the team?** Read [Setup](./setup.md) for tooling prerequisites, then follow [Git flow](./git-flow.md) for our branching and review process.
- **Working on the builder UI?** Jump to [Storecake Builder → Technology](./storecake-builder/technology.md) and [Installation](./storecake-builder/installation.md).
- **Working on backend APIs?** Start with [Storecake API → Technology](./storecake-api/technology.md) or [Webcake API → Installation](./webcake-api/installation.md).

## How this site is organized

Each project section follows the same outline so you always know where to look:

1. **Technology** — stack overview, key dependencies, and system requirements.
2. **Installation** — clone, build, run locally with Docker or native tooling.
3. **Extension and rules** — coding conventions, editor extensions, lint and i18n rules.
4. **Docs research** — links to official upstream docs and short primers on patterns we rely on.
5. **Error / Run** — runbooks for common operational tasks and known issues (backend projects only).

If something is missing or out of date, edit the page directly from the GitHub link at the top — improvements from anyone are welcome.
