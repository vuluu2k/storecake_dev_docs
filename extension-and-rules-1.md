# Extension and rules

Quy ước code, tooling và extension VSCode cho `builderx_api`.

## VSCode extensions khuyến nghị

| Extension                           | Mục đích                                  |
| ----------------------------------- | ----------------------------------------- |
| `JakeBecker.elixir-ls` (ElixirLS)   | Language server: format, completion, dialyzer. |
| `phoenixframework.phoenix`          | Snippet Phoenix templates.                |
| `mjmlio.vscode-mjml`                | Edit MJML email template.                 |
| `eamodio.gitlens`                   | Lịch sử git inline.                       |
| `editorconfig.editorconfig`         | Honour `.editorconfig`.                   |
| `christian-kohler.path-intellisense`| Auto-complete path.                       |

Recommended workspace settings (lưu vào `.vscode/settings.json` cá nhân):

```json
{
  "elixirLS.fetchDeps": false,
  "elixirLS.mixEnv": "dev",
  "elixirLS.dialyzerEnabled": true,
  "[elixir]": {
    "editor.formatOnSave": true
  },
  "files.exclude": {
    "_build/**": true,
    "deps/**": true,
    "node_modules/**": true
  }
}
```

## Format & lint

* `mix format` áp dụng `.formatter.exs` (đã commit). Bắt buộc chạy trước khi commit:

  ```bash
  mix format
  ```

* `mix credo --strict` (nếu enable) – kiểm tra style.
* `mix compile --warnings-as-errors` ở CI.
* `mix dialyzer` – ElixirLS đã chạy ngầm, không bắt buộc local.

## Convention code Elixir

* Module đặt theo namespace domain: `BuilderxApi.Products.Product`, `BuilderxApi.Products`.
* Schema dùng `use BuilderxApi.Schema` (nếu có custom) hoặc `use Ecto.Schema` trực tiếp.
* Hàm public đặt ở context (module gốc), không expose thẳng schema ra controller.
* `with` chain cho luồng business có nhiều bước; tránh `case` lồng quá 2 cấp.
* Khi cần ghi event ngoài (Rabbit/Kafka/Webhook), dùng **Outbox** thay vì gọi trực tiếp trong cùng transaction.
* Định nghĩa enum bằng `Ecto.Enum` (preferred) hoặc module riêng + macro – không hardcode string ngẫu hứng.

## Convention controller

```elixir
defmodule BuilderxApiWeb.V1.ProductController do
  use BuilderxApiWeb, :controller
  alias BuilderxApi.Products

  action_fallback BuilderxApiWeb.FallbackController

  def index(conn, params) do
    with {:ok, %{data: products, paging: paging}} <-
           Products.list(conn.assigns.site_id, params) do
      render(conn, "index.json", products: products, paging: paging)
    end
  end
end
```

* `action_fallback` để chuẩn hoá lỗi.
* Controller **không** chạm Repo; gọi context.
* `conn.assigns.site_id` đã được Plug `BuilderxApiWeb.Plugs.SiteContext` set.

## Convention router

```elixir
scope "/api/v1", BuilderxApiWeb.V1 do
  pipe_through [:api, :auth, :site_context]

  resources "/products", ProductController, only: [:index, :show, :create, :update, :delete]
end
```

* Pipeline `:api` xử lý JSON parser, CORS.
* `:auth` verify Bearer JWT.
* `:site_context` assign `site_id` từ header `X-Site-Id`.

## Convention test

* `test/builderx_api/<domain>/` – unit test context.
* `test/builderx_api_web/controllers/` – test controller bằng `Phoenix.ConnTest`.
* Sandbox: `Ecto.Adapters.SQL.Sandbox.mode(BuilderxApi.Repo, {:shared, self()})` trong test setup khi dùng async false.
* Mock external service bằng `Mox` (nếu cấu hình) hoặc bằng bypass HTTP server.

## Quy ước commit & PR

* Commit message gắn issue id: `#1234 fix orders index leak`.
* PR mô tả: vấn đề, cách giải, ảnh hưởng, test plan.
* PR sửa migration ⇒ bắt buộc reviewer confirm tác động prod.

## Logging

* `Logger.info/2`, `Logger.warning/2`, `Logger.error/2` với metadata:

  ```elixir
  Logger.info("Order created", order_id: order.id, site_id: order.site_id)
  ```

* Không log payload nhạy cảm (password, token, full PII).
* Sentry tự capture exception unhandled; chủ động `ErrorTracker.capture/2` khi rescue.

## Cấu hình Husky/CI

* Husky không áp cho repo Elixir – kiểm tra bằng CI (`mix format --check-formatted`, `mix test`).
* Có thể setup pre-commit thủ công bằng `.git/hooks/pre-commit`:

  ```bash
  #!/usr/bin/env bash
  mix format --check-formatted || exit 1
  ```

## Thêm dependency mới

1. Thêm vào `mix.exs` deps + run `mix deps.get`.
2. Cập nhật `mix.lock` (commit cùng PR).
3. Tài liệu hoá vào [Integrations](storecake-api/integrations.md) nếu là service ngoài.
4. Đánh giá ảnh hưởng compile time + image size.

## Tham chiếu

* [Architecture](storecake-api/architecture.md)
* [Database](storecake-api/database.md)
* [Run book](run.md)
* [Error catalogue](error.md)
