---
sidebar_position: 6
title: Pinia store
---

# Pinia store

Quy ước và danh mục store đặt trong `src/stores/`.

## Quy ước chung

- Dùng `defineStore('<id>', { state, getters, actions })` theo style options cho phần lớn store; setup-style chỉ dùng khi logic phức tạp.
- `state()` luôn là **hàm trả về object** để mỗi instance độc lập.
- `actions` có thể async và gọi module trong `@/api/`. Không import `axios` trực tiếp.
- `getters` thuần — không gây hiệu ứng phụ, không mutate state.
- Đặt tên: `useXxxStore`. ID viết kebab-case theo tên feature (`user`, `site`, `editor-v2-layers`,…).
- Không import store khác ở cấp module trong tệp store. Khi cần, gọi `useOther()` **bên trong action** để tránh circular dependency.

## Danh mục store hiện có

| Store | Quản lý điều gì |
| --- | --- |
| `user.js` | User đăng nhập, profile, quyền, JWT, luồng auth. |
| `site.js` | Site đang chọn, locale mặc định, bản đồ domain. |
| `general.js` | State cấp app — cờ layout, modal toàn cục, theme. |
| `locale.js` | Locale hiện tại, danh sách locale hỗ trợ, đồng bộ với `vue-i18n`. |
| `preview.js` | State preview của Editor — chế độ thiết bị, đồng bộ editor sang preview. |
| `editor.js`, `editor/` | State Editor V1 (page, block, selection). Legacy. |
| `editor_v2/` | Các slice Editor V2: `layers`, `traits`, `history`, `selection`, `assets`, `ai`. |
| `dashboard/` | Số liệu cho dashboard, bộ lọc. |
| `landing/` | State landing builder (publish, version). |
| `payment/` | Customer Stripe, gói, đăng ký, hoá đơn. |

> Khi tạo store mới, bổ sung vào bảng trên kèm mô tả ngắn về state và action chính.

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

## Lưu trữ và khôi phục

Một số store cần ghi xuống `localStorage`:

- `user.js` — token và ngôn ngữ đã chọn.
- `site.js` — site truy cập gần nhất.
- `general.js` — theme, trạng thái sidebar collapsed.

Hiện chưa dùng `pinia-plugin-persistedstate` cấp app; việc lưu trữ được xử lý nội tuyến (qua `watch` hoặc trong `src/plugins/`). Khi thêm trường cần lưu, kiểm tra `src/plugins/` để áp dụng cách tiếp cận nhất quán.

## Cách chia slice cho Editor V2

Editor V2 tách state theo từng mối quan tâm để dễ test:

- `layers` — cây node của trang.
- `selection` — node (hoặc các node) đang được chọn.
- `history` — undo/redo theo commit, không clone toàn bộ cây.
- `traits` — giá trị trait cho từng node.
- `assets` — ảnh, font, asset đã upload.
- `ai` — các job AI sinh trang, tiến trình, lịch sử prompt.

Xem [Editor V2 — Kiến trúc](./editor-v2/01-architecture.md).

## DevTools và HMR

- Vue DevTools tự nhận Pinia khi `app.use(createPinia())`.
- Snippet HMR ở cuối tệp store:

  ```js
  if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useProductStore, import.meta.hot));
  }
  ```

## Sai sót thường gặp

- Không truy cập được `this` trong action viết dạng arrow function — dùng `function` hoặc lấy state qua tham số (chỉ trong getter).
- Để reset toàn bộ state, gọi `this.$reset()` thay vì gán từng trường.
- Không import store ở module cấp top của tệp dùng chung (chạy trước khi Pinia install). Gọi `useStore()` bên trong hàm.
