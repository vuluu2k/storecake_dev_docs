---
sidebar_position: 13
title: Lỗi thường gặp
---

# Lỗi thường gặp

Các vấn đề đã biết và cách xử lý nhanh cho **builderx_api**.

## "Publish" hoặc "Save" lỗi trong builder

**Triệu chứng** — Khi publish hoặc save từ giao diện builder, request trả về 500 và log báo lỗi ghi file CSS.

**Nguyên nhân** — Thư mục `priv/static/css` không tồn tại trong container.

**Cách fix** — Tạo thư mục rồi thử lại:

```bash
mkdir -p priv/static/css
```

Nếu bạn chạy trong Docker, làm trong `make bash` để đường dẫn được tạo bên trong volume của container.
