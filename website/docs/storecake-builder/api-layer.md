---
sidebar_position: 7
title: Tầng API
---

# Tầng API

Tầng `src/api/` đảm nhiệm toàn bộ HTTP/HTTPS đi tới các backend (`builderx_api`, `landing_page_backend`, một số bên thứ ba). Mục tiêu: một bộ interceptor axios duy nhất, gộp request trùng, dễ mock, view không phải bận tâm tới chi tiết transport.

## Luồng

```text
View / Composable
       │
       ▼
@/api/<feature>Api    →   axiosClient   →   server.js (proxy) → backend
       │                     ▲
       └─ inFlightPool ──────┘ (gộp request trùng đang chờ)
```

## Tệp chính

- `axiosClient.js` — instance axios duy nhất (baseURL, `Authorization`, `Accept-Language`, timeout, interceptor 401/403, retry nhẹ).
- `baseApi.js` — factory tạo endpoint CRUD:

  ```js
  const productApi = baseApi('products');
  productApi.list(params);
  productApi.detail(id);
  productApi.create(payload);
  productApi.update(id, payload);
  productApi.remove(id);
  ```

- `inFlightPool.ts` — pool gộp theo `(method, url, params)` để các caller cùng request nhận chung một Promise.

## Viết một module API

```js
// src/api/orderApi.js
import client from './axiosClient';
import baseApi from './baseApi';

const base = baseApi('orders');

const orderApi = {
  ...base,
  async exportCsv(filter) {
    const { data } = await client.get('/orders/export', {
      params: filter,
      responseType: 'blob',
    });
    return data;
  },

  async reorder(orderId) {
    const { data } = await client.post(`/orders/${orderId}/reorder`);
    return data;
  },
};

export default orderApi;
```

Quy ước:

- Một tệp cho mỗi feature: `<feature>Api.js`.
- Export mặc định một object chứa các method async.
- Ném lại lỗi gốc của axios — không bọc trong lớp Error riêng. Store hoặc view tự quyết cách xử lý.
- Không truy cập store hay mutate state từ module API.

## Interceptor

`axiosClient.js` cấu hình:

| Interceptor | Hành vi |
| --- | --- |
| Request `Authorization` | Lấy token từ `useUserStore` hoặc cookie `pat_token`. |
| Request `Accept-Language` | Lấy từ `useLocaleStore`. |
| Request `X-Site-Id` | Thêm khi đã chọn site (`useSiteStore`). |
| Response 401 | Đăng xuất và điều hướng `/login`. |
| Response 403 | Hiển thị toast lỗi phân quyền. |
| Response 5xx | Báo về Sentry, hiển thị toast chung. |

Để bỏ qua xác thực (hiếm — endpoint public), truyền `{ headers: { 'X-Skip-Auth': true } }` rồi xử lý trong interceptor.

## URL

- Base mặc định: `import.meta.env.VITE_BUILDERX_API_URL`.
- Gọi sang `landing_page_backend` dùng module trong `src/api/landing/` với base riêng `VITE_LANDING_PAGE_API_URL`.
- Endpoint nội bộ ràng buộc cookie đi qua `server.js` với prefix `/internal/`.

## Gộp và huỷ request

- `inFlightPool` chia sẻ chung Promise cho các `GET` đang chờ.
- Trên màn hình biến động, huỷ request cũ:

  ```js
  const controller = new AbortController();
  client.get('/products', { signal: controller.signal });
  controller.abort();
  ```

## Mock cho test

- Có thể override `axiosClient.defaults.baseURL` qua biến môi trường để trỏ tới proxy local.
- Mock cứng có thể đặt trong `src/api/__mocks__/` (chưa chính thức — bàn với team trước khi áp dụng).

## Sai sót thường gặp

- Quên `await` khi gọi method API trong action Pinia — state có thể được gán trước khi dữ liệu về.
- Response trả `{ data, paging }` nên giữ nguyên cho store reshape, không reshape trong module API.
- Không tự đặt `Content-Type` khi upload `FormData` — axios tự sinh boundary.
- Không log token ra console (ESLint đã có cảnh báo).
