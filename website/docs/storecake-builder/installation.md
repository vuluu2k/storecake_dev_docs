---
sidebar_position: 4
title: Installation
---

# Installation

## Prerequisites

- Node.js 18 LTS or newer
- npm or yarn
- Docker (optional, only if you want the containerized workflow)

## 1. Clone the repository

```bash
git clone git@github.com:pancake-vn/builderx_spa.git
cd builderx_spa
```

## 2. Install dependencies

```bash
npm install
# or
yarn install
```

The `postinstall` step copies the TinyMCE assets into the repo root — that is expected.

## 3. Configure environment variables

Copy the example file and fill in the values for your environment:

```bash
cp .env.example .env
```

At a minimum you will need the backend API URL and any auth keys provided by the team.

## 4. Run the project

### Development (hot reload)

```bash
npm run dev
# or
yarn dev
```

### Production build

```bash
npm run build:client
# or
yarn build:client
```

The built assets land in `dist/client/`.

## Useful scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the development server (Vite + Express). |
| `npm run watch` | Same as `dev` but with `nodemon` auto-reload of the Node layer. |
| `npm run build:client` | Build the SPA for production. |
| `npm run clean` | Remove the `dist/` directory. |
| `npm run lint` | Lint and auto-fix `.js` / `.vue` files. |
| `npm run format` | Format the codebase with Prettier. |
| `npm run setup:husky` | Install Husky Git hooks. |

## Docker workflow

The repository includes a Makefile wrapping the most common Docker commands:

```bash
make dev   # Start the dev container
make bash  # Open a shell inside the container
```

Use this when you want full parity with the deployment environment or to avoid installing Node natively.
