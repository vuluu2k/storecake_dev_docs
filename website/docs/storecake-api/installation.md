---
sidebar_position: 5
title: Installation
---

# Installation

The recommended workflow uses Docker so everyone shares the same Elixir, Postgres, and supporting-service versions. Native Elixir is fine too if you prefer.

## Prerequisites

- Docker and Docker Compose (recommended), **or** Elixir 1.12.x · Erlang/OTP 24 · Node.js 14+ installed locally.
- Access to the `pancake-vn` GitHub organization.

## 1. Clone the repository

```bash
git clone git@github.com:pancake-vn/builderx_api.git
cd builderx_api
```

## 2. Build the Docker image

```bash
make build
```

## 3. Start the app in development mode (hot reload)

```bash
make dev
```

## 4. Open a shell inside the container

```bash
make bash
```

Run the remaining steps inside that shell.

## 5. Install Elixir deps and set up the database

```bash
mix deps.get
mix ecto.setup
```

`mix ecto.setup` creates the database, runs all migrations, and seeds initial data.

## 6. Install Node.js dependencies for `assets/`

```bash
cd assets
npm install
cd ..
```

## Verifying the setup

- Phoenix should be listening on [http://localhost:4000](http://localhost:4000).
- `mix phx.routes` lists every registered route.
- See [Run](./run.md) for common runbooks (creating accounts, reindexing Elasticsearch, warming caches).
