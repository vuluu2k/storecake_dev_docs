# Công nghệ

**builderx_spa** là site builder trên web, là engine của Storecake Editor. Đây là một Single Page Application Vue 3, đi kèm một server Express nhỏ để serve entry kiểu SSR, host static asset và proxy một vài endpoint.

## Stack frontend

- **Vue 3** với Options API làm style chính.
- **Vite** cho dev và build production.
- **Pinia** cho global state management.
- **Vue Router** cho client-side routing.
- **TailwindCSS** cho utility-first styling.
- **Ant Design Vue 3** làm component library nền — wrap dưới `@/components/design/*`.
- **CodeMirror 6** và **Monaco Editor** cho code editor trong trình duyệt.
- **Quill** (rich text), **TinyMCE** (rich text legacy), **ApexCharts** (biểu đồ), **Phoenix Channels** (real-time), **Sentry** (error reporting).

## Backend đi kèm

Repo có sẵn một server Node nhỏ để host bản SPA đã build và phục vụ một vài endpoint phụ trợ:

- **Node.js + Express** với routing theo subdomain.
- **Socket.io** cho editor presence và live update.
- Asset của **TinyMCE** được bundle qua `postinstall`.

Phần xử lý nặng (data, auth, tích hợp) nằm ở [builderx_api](../storecake-api/technology.md).

## Yêu cầu hệ thống

- **Node.js** 18 LTS trở lên (16 vẫn chạy được nhưng không còn được khuyến nghị).
- **npm** ≥ 9 hoặc **yarn** classic.
- **Docker** (tùy chọn) — để có môi trường giống backend dev setup.

## Cấu trúc repository

```
builderx_spa/
├── server.js            # Entry Express — serve bản SPA đã build
├── src/                 # Source code ứng dụng Vue 3
│   ├── components/      # Component dùng chung
│   │   └── design/      # Wrapper quanh Ant Design — luôn import từ đây
│   ├── i18n/locales/    # JSON dịch, ngôn ngữ nguồn: vi
│   ├── stores/          # Pinia stores
│   └── router/          # Vue Router
├── public/              # Static asset
├── dist/                # Output build (gitignore)
├── tailwind.config.cjs
├── vite.config.js
├── Makefile             # Docker shortcut (make dev, make bash)
└── package.json
```
