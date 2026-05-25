# Components

Bộ design system của Storecake xây dựng trên **Ant Design Vue 3**. Mỗi component dùng chung kế thừa API gốc của Ant Design rồi thêm một lớp props riêng cho dự án.

## Đường dẫn import

Tất cả component thuộc design system nằm trong `@/components/design/`. Luôn import từ đường dẫn này — **không bao giờ** import trực tiếp từ `ant-design-vue` trong code feature.

```js
import Button from '@/components/design/Button.vue'
```

Lớp gián tiếp này cho phép team:

- Đặt default cho dự án (size, màu, behavior) ở một chỗ duy nhất.
- Đổi hoặc mở rộng component gốc mà không phải đụng tới từng nơi gọi.
- Tách lớp này thành package npm độc lập trong tương lai.

## Tài liệu tham khảo

Tài liệu trực quan về các component, props và slot được publish tại
[storecake components](https://vuluu2k.github.io/storecake_components).

## Roadmap

Lớp design system sẽ được tách ra thành package npm độc lập để dùng được ngoài `builderx_spa`. Trước khi tách, `@/components/design/` vẫn là đường dẫn import chuẩn duy nhất.
