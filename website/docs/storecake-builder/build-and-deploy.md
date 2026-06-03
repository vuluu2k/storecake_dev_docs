---
sidebar_position: 10
title: Build và Deploy
---

# Build & Deploy

`builderx_spa` được build bằng Vite, package + `server.js` Express deploy ra server bằng Ansible.

## Scripts npm

| Script                   | Mục đích                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| `npm run dev`            | Chạy `node server.js` – Express + Vite middleware (dev mode).                              |
| `npm run watch`          | Chạy `nodemon server.js` cho auto reload server-side.                                      |
| `npm run build:client`   | `vite build --outDir dist/client --mode production`.                                       |
| `npm run test_build:client` | Build vào folder hash theo commit (`dist/client_<sha>`) → dùng cho preview/QA.          |
| `npm run clean`          | Xoá `dist/`.                                                                               |
| `npm run lint`           | ESLint `--fix` cho `src/`.                                                                  |
| `npm run format`         | Prettier cho toàn repo.                                                                     |
| `npm run setup:husky`    | Cài Husky + chmod hook.                                                                     |
| `npm run validate:schemas` | Validate JSON schema Editor V2 ở `schemas/`.                                             |
| `npm run build:schemas`  | Build `schemas/elements.json` từ folder `schemas/elements/*`.                              |
| `npm run deploy`         | Alias build (`build:client`) – wrapper, không tự push.                                     |

## Build pipeline

1. **Validate schema** (CI nên chạy `npm run validate:schemas`).
2. **Lint** + **format check**.
3. `npm run build:client` → tạo `dist/client/`:
   * `index.html`, `index_themes.html`.
   * Chunk `assets/*.js`, `assets/*.css`.
   * Static copy từ `public/`.
4. Postinstall hook đảm bảo `tinymce/` được copy ra (`rm -rf tinymce && cp -R node_modules/tinymce tinymce`) – cần thiết cho dev local; trên CI sau khi cài deps cũng được.

## Server runtime (production)

* `server.js` cần:
  * `dist/client/` đã có.
  * Biến `process.env.*` đầy đủ (xem [Environment](environment.md)).
  * Port mặc định 3000 (chỉnh trong `server.js`).
* Khuyến nghị chạy sau **Nginx** với cấu hình cache asset hash (`assets/*` `max-age=31536000`).

## Docker

* `Dockerfile` (root) build image gọn (Node 16 alpine, copy `dist/`, `server.js`, `package.json`).
* `docker-compose.yml` dùng cho **dev** (mount source, link backend).
* `make dev` → docker compose up.
* `make bash` → vào container.

## Deploy (Ansible)

Thư mục `ansible/` chứa playbook. Triển khai chung 2 môi trường:

* `staging`
* `production` (chia nhiều cluster theo region)

Workflow điển hình:

1. Merge feature vào `develop` → CI build & deploy staging.
2. QA pass → merge `develop` → `master`.
3. Trên máy có quyền:
   ```bash
   cd builderx_spa
   ansible-playbook -i ansible/inventory.yaml ansible/deploy.yaml
   ```
4. Playbook sẽ:
   * `git pull` repo trên server.
   * `npm ci && npm run build:client`.
   * Reload service Node (systemd hoặc pm2 tuỳ cấu hình).
   * Đẩy bundle ra CDN nếu enable.

## Preview test build (per-commit)

```bash
npm run test_build:client
# → dist/client_<short_sha>/
```

Phù hợp để upload PR preview lên S3 hoặc preview server.

## Verify sau deploy

* Mở admin URL, kiểm tra version (Sentry release / header `x-build`).
* Smoke test luồng login, dashboard, list products, mở Editor V2.
* Kiểm tra Sentry không có spike error mới.
* Theo dõi log Nginx + service Node 5 phút đầu.

## Rollback

* Server giữ `current` symlink trỏ tới build hiện tại (Ansible release pattern).
* Khi rollback:
  ```bash
  ansible-playbook -i ansible/inventory.yaml ansible/rollback.yaml
  ```
  hoặc đổi symlink thủ công về release trước rồi reload service.

## Đo lường

* Sentry release tag = `package.json` version + git SHA.
* `src/measure/` chứa code đo Web Vitals và custom mark (publish, AI generate).
* Nên kiểm tra **bundle size** sau khi thêm dependency: `npx vite-bundle-visualizer` (cài tạm khi audit).
