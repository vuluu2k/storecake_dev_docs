# Cài đặt môi trường

Danh sách kiểm tra ngắn để chuẩn bị một máy tính mới sẵn sàng làm việc trên ba repository Storecake. Bước cài đặt riêng cho từng dự án nằm trong từng mục dự án — trang này chỉ liệt kê những thứ chung mà mọi người đều cần.

## Công cụ bắt buộc

| Công cụ | Mục đích | Phiên bản khuyến nghị |
| --- | --- | --- |
| **Git** | Quản lý mã nguồn | Bản stable mới nhất |
| **Docker Desktop** (hoặc OrbStack) | Chạy backend và stack local | Bản stable mới nhất |
| **Node.js** | builderx_spa và frontend assets | 18 LTS trở lên |
| **Elixir / Erlang** | Tùy chọn — phát triển backend không dùng Docker | Elixir 1.12.x · OTP 24 |
| **Make** | Task runner mà mọi repo đều dùng | Đã có sẵn trên macOS / Linux |
| **VS Code** | Editor được khuyến nghị (xem danh sách extension trong từng dự án) | Bản stable mới nhất |

> Phần lớn anh em trong team chạy backend trong Docker và SPA chạy trực tiếp trên máy. Bạn chỉ cần cài Elixir native nếu muốn mở IEx shell hoặc chạy `mix task` mà không vào container.

## SSH và quyền truy cập GitHub

1. Tạo SSH key (`ssh-keygen -t ed25519`) và thêm vào tài khoản GitHub.
2. Kiểm tra truy cập: `ssh -T git@github.com`.
3. Đảm bảo bạn đã được mời vào tổ chức `pancake-vn` — nhắn maintainer nếu chưa thấy các repository.

## Cấu hình Git nên có

Đặt thông tin định danh:

```bash
git config --global user.name "Tên của bạn"
git config --global user.email "ban@example.com"
```

Bật rebase khi pull và tự dọn ref cũ khi fetch:

```bash
git config --global pull.rebase true
git config --global fetch.prune true
```

## Bước tiếp theo

- Đọc [Quy trình Git](git-flow.md) để nắm quy ước branching, commit và review.
- Chọn dự án bạn sẽ làm và đi theo trang **Installation** của dự án đó.
