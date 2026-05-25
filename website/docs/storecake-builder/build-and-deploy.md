---
sidebar_position: 10
title: Build & Deploy
---

# Build & Deploy

`builderx_spa` is built with Vite, packaged with `server.js`, and shipped to servers via Ansible.

## npm scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Run `node server.js` — Express + Vite middleware in dev mode. |
| `npm run watch` | Same as `dev` with `nodemon` reload of the Node layer. |
| `npm run build:client` | `vite build --outDir dist/client --mode production`. |
| `npm run test_build:client` | Build into `dist/client_<sha>` — for QA preview builds. |
| `npm run clean` | Delete `dist/`. |
| `npm run lint` | ESLint `--fix` over `src/`. |
| `npm run format` | Prettier across the repo. |
| `npm run setup:husky` | Install Husky + chmod hooks. |
| `npm run validate:schemas` | Validate Editor V2 JSON schemas in `schemas/`. |
| `npm run build:schemas` | Rebuild `schemas/elements.json` from `schemas/elements/*`. |
| `npm run deploy` | Alias for `build:client` (does not push). |

## Build pipeline

1. **Validate schemas** in CI (`npm run validate:schemas`).
2. **Lint + format check**.
3. `npm run build:client` → produces `dist/client/`:
   - `index.html`, `index_themes.html`.
   - Hashed `assets/*.js`, `assets/*.css`.
   - Files copied from `public/`.
4. The `postinstall` hook ensures `tinymce/` exists at the repo root (`rm -rf tinymce && cp -R node_modules/tinymce tinymce`).

## Runtime in production

- `server.js` requires:
  - `dist/client/` present.
  - All `process.env` populated (see [Environment](./environment.md)).
  - Default port 3000 (configurable in `server.js`).
- Recommended deployment: behind Nginx with `Cache-Control: max-age=31536000` for hashed `assets/*` and `no-cache` for `index.html`.

## Docker

- `Dockerfile` builds a slim Node 16 alpine image containing `dist/`, `server.js`, and `package.json`.
- `docker-compose.yml` is for **dev** (mounts source, links backend containers).
- `make dev` brings up the dev stack; `make bash` opens a shell inside the container.

## Ansible deploy

`ansible/` contains the playbooks. Two environments: `staging` and `production` (with per-region clusters).

Typical flow:

1. Merge a feature branch into `develop` → CI auto-deploys staging.
2. After QA, merge `develop` into `master`.
3. From an operator workstation:

   ```bash
   cd builderx_spa
   ansible-playbook -i ansible/inventory.yaml ansible/deploy.yaml
   ```

The playbook:

- Pulls the repo on the target server.
- Runs `npm ci && npm run build:client`.
- Reloads the Node service (systemd / pm2 depending on cluster).
- Optionally pushes the bundle to the CDN.

## Per-commit preview builds

```bash
npm run test_build:client
# → dist/client_<short_sha>/
```

Handy when uploading PR-preview bundles to S3 or a staging server.

## Post-deploy checklist

- Open the admin URL; verify the build version (Sentry release tag or `x-build` header).
- Smoke test: login, dashboard, list products, open Editor V2.
- Watch Sentry for new error spikes (10–15 min).
- Watch Nginx + Node logs for the first few minutes.

## Rollback

- Servers keep a `current` symlink pointing at the active release (Ansible release pattern).
- Roll back:

  ```bash
  ansible-playbook -i ansible/inventory.yaml ansible/rollback.yaml
  ```

  …or flip the symlink to the previous release and reload Node manually.

## Measurement

- Sentry release tag = `package.json` version + git SHA.
- `src/measure/` collects Web Vitals + custom marks (publish, AI generate).
- Audit bundle size after introducing a dependency: `npx vite-bundle-visualizer`.
