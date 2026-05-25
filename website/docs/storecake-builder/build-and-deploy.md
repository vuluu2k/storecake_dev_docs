---
sidebar_position: 10
title: Build và Deploy
---

# Build và Deploy

`builderx_spa` build bằng Vite, đóng gói cùng `server.js` và triển khai lên server bằng Ansible.

## Script npm

| Script | Vai trò |
| --- | --- |
| `npm run dev` | Chạy `node server.js` — Express + Vite middleware ở chế độ dev. |
| `npm run watch` | Giống `dev` nhưng dùng `nodemon` để reload lớp Node. |
| `npm run build:client` | `vite build --outDir dist/client --mode production`. |
| `npm run test_build:client` | Build vào `dist/client_<sha>` — cho bản preview / QA. |
| `npm run clean` | Xoá thư mục `dist/`. |
| `npm run lint` | ESLint `--fix` cho `src/`. |
| `npm run format` | Prettier toàn repo. |
| `npm run setup:husky` | Cài Husky + chmod hook. |
| `npm run validate:schemas` | Kiểm tra JSON schema trait Editor V2 trong `schemas/`. |
| `npm run build:schemas` | Sinh lại `schemas/elements.json` từ `schemas/elements/*`. |
| `npm run deploy` | Alias cho `build:client` (không tự push). |

## Quy trình build

1. **Validate schema** ở CI (`npm run validate:schemas`).
2. **Lint + kiểm tra format**.
3. `npm run build:client` — sinh `dist/client/`:
   - `index.html`, `index_themes.html`.
   - `assets/*.js`, `assets/*.css` đã hash.
   - Tệp tĩnh copy từ `public/`.
4. Hook `postinstall` đảm bảo thư mục `tinymce/` tồn tại ở thư mục gốc (`rm -rf tinymce && cp -R node_modules/tinymce tinymce`).

## Vận hành ở production

- `server.js` cần:
  - Có sẵn `dist/client/`.
  - Đầy đủ biến `process.env.*` (xem [Biến môi trường](./environment.md)).
  - Cổng mặc định 3000 (cấu hình trong `server.js`).
- Khuyến nghị: chạy sau **Nginx**, đặt `Cache-Control: max-age=31536000` cho `assets/*` đã hash và `no-cache` cho `index.html`.

## Docker

- `Dockerfile` build image gọn (Node 16 alpine, chứa `dist/`, `server.js`, `package.json`).
- `docker-compose.yml` dùng cho **dev** (mount source, link với container backend).
- `make dev` khởi động stack dev; `make bash` mở shell trong container.

## Triển khai bằng Ansible

Thư mục `ansible/` chứa playbook. Hai môi trường: `staging` và `production` (chia cluster theo region).

Quy trình điển hình:

1. Merge nhánh feature vào `develop` → CI tự deploy staging.
2. QA thông qua → merge `develop` vào `master`.
3. Trên máy có quyền:

   ```bash
   cd builderx_spa
   ansible-playbook -i ansible/inventory.yaml ansible/deploy.yaml
   ```

Playbook sẽ:

- Pull repo trên server.
- Chạy `npm ci && npm run build:client`.
- Reload service Node (systemd hoặc pm2 tuỳ cluster).
- Nếu bật CDN, đẩy bundle lên CDN.

## Build preview theo commit

```bash
npm run test_build:client
# → dist/client_<short_sha>/
```

Tiện cho việc upload bản preview của một PR lên S3 hoặc server staging.

## Việc cần làm sau khi deploy

- Mở URL admin, kiểm tra phiên bản build (Sentry release tag hoặc header `x-build`).
- Smoke test: đăng nhập, dashboard, danh sách sản phẩm, mở Editor V2.
- Theo dõi Sentry 10–15 phút để phát hiện lỗi mới.
- Theo dõi log Nginx và Node những phút đầu.

## Rollback

- Server giữ symlink `current` trỏ về release đang chạy (pattern release của Ansible).
- Cách rollback:

  ```bash
  ansible-playbook -i ansible/inventory.yaml ansible/rollback.yaml
  ```

  Hoặc trỏ symlink về release trước rồi reload Node thủ công.

## Đo lường

- Sentry release tag = phiên bản trong `package.json` + git SHA.
- `src/measure/` thu Web Vitals và các mark tuỳ chỉnh (publish, AI generate).
- Khi thêm dependency, nên audit kích thước bundle: `npx vite-bundle-visualizer`.
