# Installation

Hướng dẫn cài đặt `builderx_spa` từ đầu. Đảm bảo đã đọc [Setup](setup.md) (yêu cầu chung) trước.

## 1. Clone repo

```bash
git clone git@github.com:pancake-vn/builderx_spa.git
cd builderx_spa
```

> Tip: clone song song `builderx_api` và `landing_page_backend` vào cùng parent folder để dễ chuyển ngữ cảnh:
>
> ```bash
> # Ở thư mục cha (vd ~/web_cake)
> ls
> # builderx_spa builderx_api landing_page_backend
> ```

## 2. Cài dependencies

```bash
nvm use 16            # hoặc nvm install 16
npm install
```

Hook `postinstall` sẽ tự copy `tinymce/` ra root (cần thiết để load asset TinyMCE qua URL `/tinymce/...`).

## 3. Tạo file `.env`

```bash
cp .env.development .env
```

Chỉnh các giá trị cho khớp môi trường local. Chi tiết ở [Environment variables](storecake-builder/environment.md). Quan trọng:

* `VITE_BUILDERX_API_URL` → URL `builderx_api` của bạn (mặc định `http://localhost:24679`).
* `VITE_LANDING_PAGE_API_URL`, `VITE_LANDING_PAGE_BUILDER_URL` → URL `landing_page_backend`.
* `JWT_KEY` → giữ giá trị mặc định khi chạy local; **prod** lấy từ Vault/Ansible.
* OAuth client (Google, Facebook, Pancake…) → có thể dùng giá trị mẫu trong `.env.development` khi dev nội bộ.

## 4. Cài Husky pre-commit

```bash
npm run setup:husky
# nếu hook không chạy được:
chmod +x .husky/pre-commit
```

## 5. Chạy dev server

```bash
npm run dev          # node server.js (Express + Vite middleware)
# hoặc nodemon:
npm run watch
```

Mặc định:

* Admin SPA: `http://localhost:5173`
* Storefront theme preview: `http://<store-subdomain>.localhost:5173`

> Vite chạy embedded trong `server.js`, không phải `vite` standalone. Khi đổi `vite.config.js`, restart `node server.js`.

## 6. Build production

```bash
npm run build:client
node server.js       # phục vụ dist/client/
```

## 7. Docker (tuỳ chọn)

```bash
make dev             # docker-compose up + mount source
make bash            # mở shell trong container
```

## 8. Lệnh hữu ích

| Lệnh                         | Mục đích                                                            |
| ---------------------------- | ------------------------------------------------------------------- |
| `npm run dev`                | Dev server                                                          |
| `npm run watch`              | Dev server với nodemon                                              |
| `npm run build:client`       | Build production                                                    |
| `npm run test_build:client`  | Build theo commit SHA (cho preview/QA)                              |
| `npm run clean`              | Xoá `dist/`                                                         |
| `npm run lint`               | ESLint --fix toàn bộ `src/`                                          |
| `npm run lint-path <path>`   | Lint một file/folder cụ thể                                          |
| `npm run format`             | Prettier toàn repo                                                  |
| `npm run validate:schemas`   | Validate JSON schema trait Editor V2                                |
| `npm run build:schemas`      | Aggregate schema → `schemas/elements.json`                          |
| `npm run setup:husky`        | Cài Husky hook                                                      |

## 9. Verify nhanh sau setup

* Mở `http://localhost:5173` → load trang login mà không lỗi 500.
* Đăng nhập bằng tài khoản nội bộ → vào dashboard.
* Vào "Editor V2" cho 1 site test → đảm bảo không lỗi Phoenix Channel (WS).
* `npm run lint` chạy không lỗi.

Nếu một trong các bước fail, xem [Troubleshooting](storecake-builder/troubleshooting.md).
