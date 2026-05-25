# Pinia stores

Quy ước và mô tả các store hiện có trong `src/stores/`.

## Convention chung

* Dùng `defineStore('<id>', { state, getters, actions })` (Options style) cho phần lớn store cũ; store mới có thể dùng setup-style nếu logic phức tạp.
* `state()` luôn là **function** trả về object để mỗi instance độc lập.
* `actions` được phép `async`, gọi tới module trong `@/api/`. **Không** import axios trực tiếp.
* `getters` thuần, không gây side-effect. Không sửa state trong getter.
* Naming: `useXxxStore`. ID kebab-case theo tên feature (`user`, `site`, `editor-v2-layers`,…).
* Store không import store khác trong định nghĩa top-level. Khi cần, gọi `useOther()` **bên trong action** để tránh circular deps.

## Danh sách store

| Store                | Mục đích                                                                |
| -------------------- | ----------------------------------------------------------------------- |
| `user.js`            | User hiện tại, profile, permission, JWT, auth flow.                     |
| `site.js`            | Site đang được chọn (multi-site). Cung cấp `siteId`, config, locale mặc định, domain map. |
| `general.js`         | App-level state: layout flag, modal global, loading global, theme, breadcrumb. |
| `locale.js`          | Locale hiện tại, danh sách locale hỗ trợ, đồng bộ với `vue-i18n`.       |
| `preview.js`         | State preview cho Editor (responsive mode, device frame, sync editor → preview). |
| `editor.js`, `editor/` | Trạng thái Editor V1 (page, block, drag, selected). Legacy.           |
| `editor_v2/`         | Slice store Editor V2: `layers`, `traits`, `history`, `selection`, `assets`, `ai`. |
| `dashboard/`         | Số liệu cho Dashboard, widget filter.                                    |
| `landing/`           | Landing builder state (publish, version).                                |
| `payment/`           | Stripe customer, plan, invoice, subscription.                            |

> Khi tạo store mới, thêm entry vào bảng trên + tài liệu hoá `state` chính, `actions` chính.

## Mẫu store khuyến nghị

```js
// src/stores/product.js
import { defineStore } from 'pinia';
import productApi from '@/api/productApi';

export const useProductStore = defineStore('product', {
  state: () => ({
    items: [],
    paging: { page: 1, pageSize: 20, total: 0 },
    loading: false,
    filter: {},
  }),

  getters: {
    isEmpty: (s) => !s.loading && s.items.length === 0,
  },

  actions: {
    async fetch(params = {}) {
      this.loading = true;
      try {
        const { data, paging } = await productApi.list({ ...this.filter, ...params });
        this.items = data;
        this.paging = paging;
      } finally {
        this.loading = false;
      }
    },

    setFilter(filter) {
      this.filter = filter;
      this.paging.page = 1;
      return this.fetch({ page: 1 });
    },
  },
});
```

## Persist & rehydrate

Một số store cần lưu sang `localStorage`:

* `user.js` → token, ngôn ngữ chọn.
* `site.js` → site cuối cùng truy cập.
* `general.js` → theme, sidebar collapsed.

Hiện chưa dùng `pinia-plugin-persistedstate` toàn cục; tự handle bằng `watch` trong store hoặc trong `plugins/`. Khi thêm field cần persist, kiểm tra `src/plugins/` xem có instance chung không.

## Tương tác với Editor V2

Editor V2 chia store theo concern (mỗi file một slice) để dễ test:

* `layers` – cây node của trang.
* `selection` – node đang chọn, multi-select.
* `history` – undo/redo (commit-based, không clone toàn cây).
* `traits` – mapping trait value cho từng node.
* `assets` – ảnh, font, asset đã upload.
* `ai` – job AI page generation, progress, prompt history.

Xem chi tiết workflow tại [Editor V2 — Architecture](editor-v2/01-architecture.md).

## DevTools

* Vue DevTools (browser extension) detect Pinia tự động khi `app.use(createPinia())`.
* Mỗi store hiển thị section riêng → tiện debug.
* HMR: thêm đoạn dưới ở cuối store nếu cần hot reload state:

```js
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useProductStore, import.meta.hot));
}
```

## Pitfalls hay gặp

* `this` không hoạt động trong arrow function nếu khai báo trong `actions`. Dùng `function` keyword hoặc giữ arrow nhưng access state qua param (chỉ getter).
* Khi reset toàn bộ state, dùng `this.$reset()` thay vì gán từng field.
* Tránh import store ở module-level của file shared (sẽ chạy trước khi Pinia install). Gọi `useStore()` trong hàm thay vào.
