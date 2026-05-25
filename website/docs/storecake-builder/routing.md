---
sidebar_position: 5
title: Routing và Guard
---

# Routing và Guard

Cách Vue Router được khai báo trong `builderx_spa` và các guard bảo vệ từng route.

## Vị trí mã nguồn

```text
src/router/
├── index.js          # Khai báo route + bootstrap
└── guards/           # Guard: auth, permission, site, feature flag
```

## Khai báo route

```js
import { createRouter, createWebHistory } from 'vue-router';
import authGuard from './guards/auth';
import siteGuard from './guards/site';

const routes = [
  {
    path: '/login',
    component: () => import('@/views/Login.vue'),
    meta: { public: true },
  },
  {
    path: '/',
    component: () => import('@/components/layout/AdminLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', component: () => import('@/views/Dashboard.vue') },
      { path: 'products', component: () => import('@/views/Products.vue') },
      {
        path: 'editor-v2/:siteId/:pageId',
        component: () => import('@/views/EditorV2.vue'),
        meta: { layout: 'blank' },
      },
    ],
  },
];

const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach(authGuard);
router.beforeEach(siteGuard);

export default router;
```

Nguyên tắc:

- **Luôn lazy-load** view (`() => import(...)`) để Vite tách chunk hợp lý.
- Layout admin bọc toàn bộ; trang chiếm toàn màn hình (ví dụ Editor V2) đặt `meta.layout = 'blank'`.
- Route công khai (`/login`, callback OAuth, accept-invite) đặt `meta.public = true` để bỏ qua guard auth.
- Đặt `name` cho route nào sẽ được điều hướng từ nơi khác.

## Các guard

| Tệp | Vai trò |
| --- | --- |
| `guards/auth.js` | Kiểm tra hoặc làm mới token; nếu thiếu thì điều hướng `/login`. Bỏ qua khi `meta.public`. |
| `guards/site.js` | Đảm bảo `useSiteStore().currentSite` đã tải xong trước khi vào các route gắn với site. |
| `guards/permission.js` | So `meta.permissions` với `user.permissions` (RBAC). |
| `guards/feature-flag.js` | Khoá theo feature flag (ví dụ Editor V2 chỉ bật cho một số tenant). |

> Tên tệp có thể thay đổi — luôn kiểm tra `src/router/guards/` trước khi sửa.

## Quy ước `meta`

| Khoá | Ý nghĩa |
| --- | --- |
| `requiresAuth` | `true` để bắt buộc đăng nhập. |
| `public` | `true` để bỏ qua guard auth. |
| `permissions` | Mảng quyền cần có (vd `['product.read']`). |
| `featureFlag` | Tên feature flag bắt buộc. |
| `layout` | `'admin'` (mặc định) / `'blank'` / `'storefront'`. |
| `title` | Tiêu đề trang (gán vào `document.title` trong `afterEach`). |
| `breadcrumb` | Cấu hình breadcrumb cho layout admin. |

## Phân tuyến theo subdomain (server.js)

Express chọn entry HTML theo subdomain:

- `admin.<domain>` → `index.html` (SPA admin).
- `<store>.<domain>` → `index_themes.html` (SPA storefront).
- Tên miền gốc nhận route iframe / preview của Editor.

Khi dev local cần subdomain, thêm bản ghi vào `/etc/hosts` (xem [Setup](../setup.md)).

## Thêm một route mới

1. Tạo `src/views/<feature>/MyPage.vue`.
2. Thêm vào `routes`:

   ```js
   {
     path: 'feature',
     name: 'feature-list',
     component: () => import('@/views/feature/MyPage.vue'),
     meta: { permissions: ['feature.read'], title: 'Tính năng' },
   }
   ```

3. Tạo store ở `src/stores/feature.js` nếu cần dùng chung state.
4. Bổ sung khoá i18n mới vào `src/i18n/locales/*.json`.

## Một số mẹo điều hướng

- Dùng `router.replace` cho điều hướng không cần tạo lịch sử (luồng đăng nhập, deeplink).
- Trong `<script setup>` dùng `useRoute()` và `useRouter()`, không truy cập `this.$route`.

## Lỗi thường gặp

- **Vòng lặp redirect** giữa `/login` và `/`: guard không bỏ qua `meta.public`. Kiểm tra thứ tự gọi guard.
- **Không match route** sau khi thêm con: route cha không được kết thúc bằng `/`, route con không được bắt đầu bằng `/`.
- **Lazy-load chunk 404** sau khi deploy: bundle đổi hash, client cũ còn cache. Router đã có error handler tự reload — đừng xoá khi sửa `router/index.js`.
