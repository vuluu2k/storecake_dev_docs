---
sidebar_position: 5
title: Installation
---

# Installation

The recommended workflow uses Docker so the Elixir, Postgres, and supporting-service versions stay aligned across the team.

## Prerequisites

- Docker and Docker Compose, **or** Elixir 1.12.x · Erlang/OTP 24 · Node.js 14+ installed locally.
- Access to the `pancake-vn` GitHub organization.

## 1. Clone the repository

```bash
git clone git@github.com:pancake-vn/landing_page_backend.git
cd landing_page_backend
```

## 2. Build the Docker image

```bash
docker compose build landing-page
```

## 3. Start the app

```bash
make app
# or, for hot reload in development:
make dev
```

## 4. Install dependencies and set up the database

Open a shell inside the running container:

```bash
make bash
```

Inside the container:

```bash
mix deps.get
mix ecto.setup
```

`mix ecto.setup` creates the database, runs migrations, and seeds initial data.

## 5. Install Node.js dependencies for `assets/`

Still inside the container:

```bash
cd ./assets && npm install
```

## Verifying the setup

- Phoenix should be listening on [http://localhost:4000](http://localhost:4000).
- `mix phx.routes` lists every registered route.
- Tail the logs with `docker compose logs -f landing-page` from the host.
