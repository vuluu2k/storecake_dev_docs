---
sidebar_position: 14
title: Xử lý sự cố
---

# Troubleshooting

Tổng hợp các lỗi hay gặp khi dev `builderx_spa`. Khi gặp lỗi mới, ghi lại đây kèm cách xử để team sau dùng lại.

## 1. `npm install` lỗi do `node-gyp` / native module

Triệu chứng: install treo ở `node-gyp rebuild`, log nói thiếu `python` hoặc `make`.

Cách xử:

* Mac: cài `xcode-select --install`.
* Linux: `sudo apt install build-essential python3`.
* Windows (WSL): cài `build-essential` trong WSL, không dùng cmd.
* Đảm bảo dùng đúng Node 16 (`nvm use 16`).

## 2. `tinymce/` không có sau install

Triệu chứng: console báo 404 ở `/tinymce/skins/...`.

Cách xử:

```bash
npm run postinstall      # tự copy lại
# hoặc thủ công
rm -rf tinymce
cp -R node_modules/tinymce tinymce
```

## 3. Lỗi CORS khi gọi `builderx_api`

Triệu chứng: console `Access-Control-Allow-Origin` blocked.

Kiểm tra:

* `VITE_BUILDERX_API_URL` đúng schema/port.
* `builderx_api` đã cấu hình `corsica` cho origin local (xem `lib/builderx_api_web/endpoint.ex` + config `:builderx_api, :cors_origins`).
* Cookie cross-site cần `SameSite=None; Secure` → khi dev local có thể tắt secure trong client.

## 4. Phoenix Channel không connect

Triệu chứng: trong DevTools tab Network → WS thấy `1006`, hoặc store không nhận event.

Kiểm tra:

* `builderx_api` đang chạy + endpoint `/socket/websocket` reachable.
* Token JWT user đang valid (logout & login lại).
* Browser block mixed content (SPA `https`, backend `http`) → đồng bộ schema.

## 5. Vite HMR không update

* Đảm bảo file thay đổi nằm trong `src/` (Vite chỉ watch `root`).
* Kiểm tra path symbol link – nếu mở repo qua symlink `~/code -> /Volumes/...`, Vite có thể không reload. Dùng đường dẫn thực.
* Xoá cache: `rm -rf node_modules/.vite`.

## 6. Husky hook không chạy

```bash
chmod +x .husky/pre-commit
git config core.hooksPath .husky
```

Nếu bị `Permission denied`:

```bash
ls -l .husky/pre-commit   # phải có x
```

## 7. ESLint chậm

* Bật cache: `npm run lint -- --cache`.
* IDE đang chạy ESLint song song với lint-staged → có thể giới hạn `eslint.workingDirectories` trong VSCode.

## 8. Build OOM (Out Of Memory)

```bash
NODE_OPTIONS=--max_old_space_size=4096 npm run build:client
```

Hoặc tăng RAM cho Docker Desktop khi build qua container.

## 9. Lỗi `Failed to fetch dynamically imported module` sau deploy

Nguyên nhân: file hash JS chunk thay đổi nhưng client cũ vẫn cache.

* SPA đã có router error handler reload trang khi chunk 404 (kiểm tra `src/router/index.js`).
* Nếu không tự reload: clear cache CDN, set header `Cache-Control: no-cache` cho `index.html`.

## 10. Subdomain dev không trỏ về local

* `/etc/hosts` thiếu entry. Thêm subdomain cần test:
  ```
  127.0.0.1 admin.localhost
  127.0.0.1 affiliate.localhost
  ```
* macOS không wildcard `*.localhost` → dùng `dnsmasq` hoặc khai từng subdomain.

## 11. TinyMCE / Monaco không load asset

Kiểm tra:

* Static path `/tinymce/` còn tồn tại (build copy đầy đủ).
* Monaco worker script đúng URL (`@guolao/vue-monaco-editor` cần config worker path khi build).
* Khi deploy CDN, không quên upload `tinymce/` cùng asset chính.

## 12. Sentry không gửi event

* `VITE_SENTRY_DSN` đúng project.
* `import.meta.env.MODE` ≠ `development` (Sentry bị disable ở dev mặc định, nếu muốn test ở dev thì sửa init flag).
* CORS Sentry DSN host bị block bởi adblock → test ở Incognito disable extension.

## 13. Editor V2 lỗi schema mismatch

Triệu chứng: load page báo trait thiếu/lệch.

* Chạy `npm run validate:schemas` → xem error cụ thể.
* Nếu thêm trait mới, chạy `npm run build:schemas` để regenerate `schemas/elements.json`.
* Kiểm tra version schema giữa client và backend (Editor V2 lưu data ở `builderx_api`).

## 14. Tools/IDE nuốt port

* Vite mặc định 5173, server `3000`. Đụng port → đổi trong `vite.config.js` (`server.port`) và `server.js` (`PORT`).

## 15. Log debug nhanh

* `localStorage.setItem('debug', 'storecake:*')` (nếu app dùng debug namespace).
* `__pinia` đã expose trong dev: `window.__pinia.state.value`.
* Component đang chọn: bật Vue DevTools.

Khi vẫn không tìm ra nguyên nhân: chụp log + reproducible step và đăng vào channel `#frontend-help` (hoặc tag team lead).
