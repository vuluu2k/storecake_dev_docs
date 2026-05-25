# Routing & Guards

Tài liệu mô tả cách `builderx_spa` tổ chức Vue Router và các guard.

## Vị trí

```
src/router/
├── index.js          # Định nghĩa route, lazy-load view
└── guards/           # Middleware (auth, permission, site, feature flag)
```

## Pattern khai báo route

```js
// src/router/index.js
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
      { path: 'editor-v2/:siteId/:pageId', component: () => import('@/views/EditorV2.vue'), meta: { layout: 'blank' } },
      // …
    ],
  },
];

const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach(authGuard);
router.beforeEach(siteGuard);

export default router;
```

Nguyên tắc:

* **Luôn lazy-load view** (`() => import(...)`) để chia chunk.
* Layout admin được wrap ở route cha; route cần fullscreen (vd Editor V2) set `meta.layout = 'blank'`.
* Route public (login, oauth callback, accept invite) set `meta.public = true` → skip guard auth.
* Đặt `name` cho route nào cần `router.push({ name, params })` từ nơi khác.

## Guards có sẵn

| File                       | Vai trò                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------ |
| `guards/auth.js`           | Kiểm tra token / refresh, redirect `/login` khi cần. Bỏ qua nếu `meta.public`.       |
| `guards/site.js`           | Đảm bảo `useSiteStore().currentSite` đã load trước khi vào route theo site.          |
| `guards/permission.js`     | So sánh `meta.permissions` với `user.permissions` (RBAC).                            |
| `guards/feature-flag.js`   | Check feature flag (vd Editor V2 chỉ enable cho một số tenant).                      |

> Tên file có thể khác tuỳ thực tế – mở `src/router/guards/` để xem danh sách hiện tại trước khi sửa.

## Quy tắc đặt meta

| `meta` key        | Ý nghĩa                                                          |
| ----------------- | ---------------------------------------------------------------- |
| `requiresAuth`    | `true` → phải đăng nhập.                                         |
| `public`          | `true` → bỏ qua guard auth.                                       |
| `permissions`     | Mảng quyền yêu cầu (`['product.read']`).                          |
| `featureFlag`     | Key feature flag cần bật.                                         |
| `layout`          | `'admin'` (default) / `'blank'` / `'storefront'`.                 |
| `title`           | Title page (gắn vào `document.title` qua afterEach).              |
| `breadcrumb`      | Breadcrumb config dùng cho layout admin.                          |

## Subdomain routing (server.js)

Express phân biệt subdomain trước khi đẩy HTML:

* `admin.<domain>` → serve `index.html` (SPA admin).
* `<store-subdomain>.<domain>` → serve `index_themes.html` (storefront SPA theme).
* Origin gốc nhận route preview/iframe (Editor preview).

Khi develop, cấu hình `/etc/hosts` (xem [Setup](../setup.md)) để test admin vs storefront.

## Mẫu thêm route mới

1. Tạo view `src/views/<feature>/MyPage.vue`.
2. Thêm entry trong `routes`:
   ```js
   {
     path: 'feature',
     name: 'feature-list',
     component: () => import('@/views/feature/MyPage.vue'),
     meta: { permissions: ['feature.read'], title: 'Feature' },
   }
   ```
3. Nếu cần state shared → tạo store dưới `src/stores/feature.js`.
4. Đảm bảo locale key mới được thêm `src/i18n/locales/*.json`.

## Navigation API tiện ích

* Dùng `router.replace` khi muốn không tạo history (login redirect, deeplink redirect).
* Dùng `useRoute()` + `useRouter()` composable thay vì truy cập `this.$route` trong setup.

## Lỗi thường gặp

* **Loop redirect** giữa `/login` và `/`: thường do guard không skip `meta.public`. Verify `meta` và thứ tự gọi guard.
* **Route không match** sau khi thêm: kiểm tra route cha có `path` không kết thúc bằng `/`, child path bắt đầu **không** có `/`.
* **Lazy-load chunk 404** sau deploy: do hash bundle thay đổi. SPA cần catch lỗi và reload (router error handler) – đã có sẵn xử lý ở `router/index.js`, nếu thêm mới phải giữ cơ chế này.
