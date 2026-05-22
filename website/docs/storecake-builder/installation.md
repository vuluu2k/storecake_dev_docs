---
sidebar_position: 2
title: Cài đặt
---

# Cài đặt

## Yêu cầu chuẩn bị

- Node.js 18 LTS trở lên
- npm hoặc yarn
- Docker (tùy chọn, chỉ cần khi bạn muốn chạy bằng container)

## 1. Clone repository

```bash
git clone git@github.com:pancake-vn/builderx_spa.git
cd builderx_spa
```

## 2. Cài dependency

```bash
npm install
# hoặc
yarn install
```

Bước `postinstall` sẽ copy asset TinyMCE vào root repo — đây là hành vi đúng, không cần lo.

## 3. Cấu hình biến môi trường

Copy file mẫu rồi điền giá trị cho môi trường của bạn:

```bash
cp .env.example .env
```

Tối thiểu bạn cần URL của backend API và các auth key do team cấp.

## 4. Chạy dự án

### Development (hot reload)

```bash
npm run dev
# hoặc
yarn dev
```

### Build production

```bash
npm run build:client
# hoặc
yarn build:client
```

Sản phẩm build nằm trong thư mục `dist/client/`.

## Các lệnh hữu ích

| Lệnh | Tác dụng |
| --- | --- |
| `npm run dev` | Chạy dev server (Vite + Express). |
| `npm run watch` | Giống `dev` nhưng có `nodemon` auto-reload phần Node. |
| `npm run build:client` | Build SPA cho production. |
| `npm run clean` | Xóa thư mục `dist/`. |
| `npm run lint` | Lint và tự sửa code `.js` / `.vue`. |
| `npm run format` | Format code bằng Prettier. |
| `npm run setup:husky` | Cài đặt Husky Git hooks. |

## Chạy bằng Docker

Repo có sẵn `Makefile` wrap các lệnh Docker thông dụng:

```bash
make dev   # Khởi động container dev
make bash  # Mở shell trong container
```

Dùng cách này khi bạn muốn môi trường giống production hoặc không muốn cài Node trực tiếp trên máy.
