---
sidebar_position: 14
title: Xử lý sự cố
---

# Xử lý sự cố

Các vấn đề thường gặp khi phát triển `builderx_spa`. Khi gặp lỗi mới, ghi lại ngay vào đây để người sau tra cứu.

## 1. `npm install` lỗi `node-gyp`

Triệu chứng: install treo ở `node-gyp rebuild`, log báo thiếu `python` hoặc `make`.

Cách xử lý:

- macOS: `xcode-select --install`.
- Linux: `sudo apt install build-essential python3`.
- Windows (WSL): cài `build-essential` trong WSL chứ không phải cmd.
- Dùng đúng Node 16 (`nvm use 16`).

## 2. Thư mục `tinymce/` không có sau khi install

Triệu chứng: console báo 404 ở `/tinymce/skins/...`.

```bash
npm run postinstall
# hoặc thao tác thủ công
rm -rf tinymce
cp -R node_modules/tinymce tinymce
```

## 3. Lỗi CORS khi gọi `builderx_api`

- Kiểm tra `VITE_BUILDERX_API_URL` đúng scheme và cổng.
- Đảm bảo `builderx_api` đã cấu hình `corsica` cho origin SPA (`config :builderx_api, :cors_origins`).
- Cookie cross-site cần `SameSite=None; Secure`. Khi dev local có thể tắt `Secure`.

## 4. Phoenix Channel không kết nối được

- Tab Network thấy WebSocket đóng với mã `1006`, hoặc store không nhận event.
- Kiểm tra `builderx_api` đang chạy và endpoint `/socket/websocket` reachable.
- Token JWT của user vẫn còn hạn (đăng xuất và đăng nhập lại để chắc).
- Trình duyệt chặn mixed content (SPA HTTPS, backend HTTP) — đồng bộ scheme.

## 5. Vite HMR không cập nhật

- File thay đổi phải nằm trong `src/` (Vite chỉ watch project root).
- Tránh đi đến code qua symlink; Vite có thể bỏ sót thay đổi.
- Xoá cache: `rm -rf node_modules/.vite`.

## 6. Husky hook không chạy

```bash
chmod +x .husky/pre-commit
git config core.hooksPath .husky
```

## 7. Lint chậm

- Bật cache: `npm run lint -- --cache`.
- Cấu hình `eslint.workingDirectories` trong VS Code để ESLint và lint-staged không chạy đè lên nhau.

## 8. Hết bộ nhớ khi build

```bash
NODE_OPTIONS=--max_old_space_size=4096 npm run build:client
```

Hoặc tăng RAM cấp cho Docker Desktop khi build trong container.

## 9. `Failed to fetch dynamically imported module` sau khi deploy

Nguyên nhân: chunk JS đã đổi hash nhưng client cũ vẫn cache.

- Router đã có handler tự reload khi chunk 404 — giữ nguyên handler đó ở `src/router/index.js`.
- Nếu vẫn không reload, flush cache CDN và đặt `Cache-Control: no-cache` cho `index.html`.

## 10. Subdomain dev không phân giải

- Thêm vào `/etc/hosts`:

  ```
  127.0.0.1 admin.localhost
  127.0.0.1 affiliate.localhost
  ```

- macOS không match wildcard `*.localhost` — khai báo từng subdomain hoặc dùng `dnsmasq`.

## 11. TinyMCE / Monaco thiếu tài nguyên

- `tinymce/` còn nguyên sau khi build.
- Cấu hình đường dẫn worker khi bundle Monaco (`@guolao/vue-monaco-editor`).
- Pipeline deploy phải upload `tinymce/` cùng với asset chính.

## 12. Sentry không gửi event

- `VITE_SENTRY_DSN` khớp project.
- `import.meta.env.MODE !== 'development'` — Sentry mặc định tắt ở dev. Đổi cờ init nếu muốn test ở dev.
- Trình chặn quảng cáo có thể chặn Sentry; test ở Incognito và tắt extension.

## 13. Editor V2 lỗi mismatch schema

- Chạy `npm run validate:schemas` để biết chính xác chỗ lệch.
- Nếu thêm trait, chạy `npm run build:schemas` để sinh lại `schemas/elements.json`.
- Đối chiếu phiên bản schema với `builderx_api`.

## 14. Cổng bị chiếm

- Vite mặc định 5173, Express 3000.
- Đổi `server.port` trong `vite.config.js` hoặc `PORT` trong `server.js`.

## 15. Helper debug nhanh

- `localStorage.setItem('debug', 'storecake:*')` nếu code có dùng namespace `debug`.
- `window.__pinia.state.value` (chỉ dev).
- Dùng Vue DevTools để biết component đang được chọn.

Khi không tự giải quyết được: đính kèm log và các bước reproduce, gửi trong kênh `#frontend-help` hoặc tag team lead.
