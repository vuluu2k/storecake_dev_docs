# Extension & quy ước code — Storefront API

Quy ước code và bộ công cụ editor cho repo **builderx_api**.

## Quy ước code

- Tuân thủ phong cách Elixir chuẩn — chạy `mix format` trước khi mở PR.
- Giữ **web layer** (`lib/builderx_api_web/`) gọn nhẹ: chỉ chứa controller, router, channel, plug. Mọi logic nghiệp vụ phải nằm trong `lib/builderx_api/`.
- Ưu tiên Ecto changeset để validate; tuyệt đối không tin trực tiếp params từ controller.
- Mỗi thay đổi schema phải có migration đi kèm, commit cùng code.
- Chỉ wire một Phoenix Channel khi thực sự cần push real-time; mặc định dùng REST.

## Extension VS Code khuyến nghị

1. **[ElixirLS](https://marketplace.visualstudio.com/items?itemName=JakeBecker.elixir-ls)** — diagnostic compiler, format, go-to-definition.
2. **[Phoenix Framework](https://marketplace.visualstudio.com/items?itemName=phoenixframework.phoenix)** — hỗ trợ template Phoenix và `.heex`.
3. **[EditorConfig](https://marketplace.visualstudio.com/items?itemName=EditorConfig.EditorConfig)** — tự đọc file `.editorconfig` của repo.

Thêm vào `.vscode/settings.json` của workspace:

```json
{
  "[elixir]": {
    "editor.formatOnSave": true,
    "editor.defaultFormatter": "JakeBecker.elixir-ls"
  },
  "elixirLS.dialyzerEnabled": false
}
```

> Dialyzer rất nặng ở lần chạy đầu. Chỉ bật khi thật sự cần.

## Quy ước database

- Đặt tên bảng theo snake_case, dạng số nhiều (`products`, `orders`).
- Khóa chính dùng UUID (binary_id), trừ khi có lý do mạnh để dùng integer.
- Mọi bảng đều có `inserted_at` và `updated_at`.
- Bảng có scope theo tenant phải chứa `site_id` và phải đánh index cho cột này.
