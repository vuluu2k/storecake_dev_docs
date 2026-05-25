# API layer

Tầng `src/api/` đảm nhiệm toàn bộ giao tiếp HTTP/HTTPS với backend (`builderx_api`, `landing_page_backend`, một số dịch vụ ngoài). Mục tiêu của tầng này: **chuẩn hoá interceptor, dedupe request, mock dễ dàng và giúp view không quan tâm tới chi tiết transport.**

## Sơ đồ

```
View / Composable
       │
       ▼
@/api/<feature>Api    →   axiosClient   →   server.js (proxy) → backend
       │                     ▲
       └─ inFlightPool ──────┘ (dedupe trong cùng request id)
```

## File chính

* `axiosClient.js` – tạo instance axios mặc định (baseURL, header `Authorization`, `Accept-Language`, timeout, interceptor 401 / 403, retry nhẹ).
* `baseApi.js` – factory tạo CRUD endpoint chuẩn:
  ```js
  const productApi = baseApi('products');
  productApi.list(params);
  productApi.detail(id);
  productApi.create(payload);
  productApi.update(id, payload);
  productApi.remove(id);
  ```
* `inFlightPool.ts` – pool dedupe theo `(method, url, params)` để tránh n request giống nhau khi component re-render.

## Convention viết API module

```js
// src/api/orderApi.js
import client from './axiosClient';
import baseApi from './baseApi';

const base = baseApi('orders');

const orderApi = {
  ...base,
  // method tuỳ biến
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

Nguyên tắc:

* Mỗi feature một file `<feature>Api.js`.
* Export object `default` chứa các method async.
* Throw lỗi gốc (axios error) – không bọc Error tự custom, để view/store xử lý theo nhu cầu.
* Không gọi store / mutate state trong API module.

## Interceptors

`axiosClient.js` cấu hình:

| Interceptor | Hành vi |
| ----------- | ------- |
| Request `Authorization` | Lấy token từ `useUserStore` hoặc cookie `pat_token`. |
| Request `Accept-Language` | Lấy từ `useLocaleStore`. |
| Request `X-Site-Id` | Khi đã chọn site (lấy từ `useSiteStore`). |
| Response 401 | Logout & redirect tới `/login`. |
| Response 403 | Hiển thị toast quyền hạn. |
| Response 5xx | Báo Sentry, hiện toast generic. |

> Khi cần bypass header (vd gọi public endpoint), truyền `{ headers: { 'X-Skip-Auth': true } }` rồi xử lý trong interceptor.

## Cấu trúc URL

* Base API mặc định: `import.meta.env.VITE_API_URL` (ví dụ `https://api.storecake.local`).
* Các endpoint tới `landing_page_backend` đi qua `src/api/landing/` với base riêng `VITE_LANDING_API_URL`.
* Một số endpoint internal đi qua `server.js` (cookie-bound) – sẽ có prefix `/internal/`.

## Dedupe & cancel

* `inFlightPool` quản lý request idempotent (`GET`). Khi 2 caller gọi cùng key → share Promise.
* Khi rời route hoặc submit form mới, cancel request cũ:
  ```js
  const controller = new AbortController();
  client.get('/products', { signal: controller.signal });
  // sau đó
  controller.abort();
  ```

## Mocking / testing

* Trong dev có thể override `axiosClient.defaults.baseURL` qua `VITE_API_URL`.
* Khi cần mock cứng cho UI, dùng `MSW` (đang được cân nhắc) hoặc tạo stub trong `src/api/__mocks__` (chưa setup chính thức, cập nhật khi áp dụng).

## Pitfalls

* Đừng quên `await` khi gọi method API trong `actions` của Pinia, nếu không state có thể set trước khi data về.
* Khi response trả paging dạng `{ data, paging }`, tránh re-shape trong API module: giữ nguyên cho store xử lý.
* Tránh đặt `Content-Type` thủ công khi upload `FormData` – axios tự set boundary; ép `multipart/form-data` sẽ hỏng.
* Tránh log token trong console (đã có hook ESLint cảnh báo).
