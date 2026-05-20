---
sidebar_position: 2
title: Technology
---

# Technology

**landing_page_backend** is the Phoenix service behind every published Webcake/Storecake landing page. Where `builderx_api` powers the editor experience, this service powers the **runtime**: serving public pages, capturing leads, and feeding analytics and integrations.

## Key capabilities

- Public APIs for landing pages, forms, and lead capture.
- Background processing with **Oban** and **GenRMQ** (RabbitMQ).
- Email delivery via **Bamboo + SMTP**.
- Object storage on **S3** with image processing through **Vix** and **Thumbnex**.
- Google Workspace integrations (Sheets, Drive).
- Scheduled jobs via **Quantum**.
- Error reporting through **Sentry**.

## System requirements

| Component | Version |
| --- | --- |
| Elixir | ≥ 1.12.2 |
| Erlang / OTP | ≥ 24 |
| Node.js | ≥ 14 (for `assets/`) |
| PostgreSQL | Latest 14.x line |
| Docker · Docker Compose | Latest stable (recommended) |
| Redis · RabbitMQ | Required for the full feature set |

## Repository layout

```
landing_page_backend/
├── lib/
│   ├── landing_page/          # Business logic — pages, leads, integrations, workers
│   └── landing_page_web/      # Web layer — controllers, routers, plugs
├── assets/                    # Public-facing assets
├── priv/repo/                 # Migrations and seeds
├── test/                      # Test suite
├── ansible/                   # Deployment playbooks
├── mix.exs
└── Makefile                   # Dev and deploy shortcuts
```

## Makefile shortcuts

| Command | What it does |
| --- | --- |
| `make app` | Run the app in Docker. |
| `make dev` | Run in development mode with hot reload. |
| `make bash` | Open a shell inside the running container. |
