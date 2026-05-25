---
sidebar_position: 4
title: Bounded context
---

# Bounded context

Các bounded context (domain) trong `lib/builderx_api/`. Mỗi context sở hữu schema và hàm nghiệp vụ riêng. Quy tắc bất di bất dịch: chỉ chạm context từ bên ngoài, không gọi `Repo` trực tiếp.

## Tài khoản và xác thực

- **`accounts/`** — User, account, mật khẩu, profile.
  - `BuilderxApi.Accounts.create_account/1`, `get_account_by_email/1`, `authenticate/2`.
  - Mật khẩu hash bằng Argon2.
- **`api_keys/`** — Token cho integration của developer.
- **`invitations/`** — Mời thành viên.
- **`otp_codes/`** — Mã OTP (email / SMS).
- **`permissions/`** — Quyền RBAC. Plug `BuilderxApiWeb.Plugs.Permission` kiểm tra.
- **`super_admin/`** — Tài khoản nội bộ Storecake; route riêng qua `super_admin_controller`.

## Site và domain

- **`sites/`** — Đơn vị tenant. Mọi dữ liệu bán hàng đều scope theo `site_id`.
- **`domains/`** — Tên miền tuỳ chỉnh (verify TXT, SSL).
- **`pages/`** — Trang CMS gắn với site.
- **`seos/`** — SEO meta theo trang / sản phẩm.
- **`sitemaps/`** — Sinh sitemap.
- **`pwas/`** — Manifest PWA theo site.
- **`site_styles/`** — Tuỳ biến theme.
- **`site_products/`, `site_tag/`, `site_utms/`** — Bảng phụ trợ.

## Sản phẩm

- **`products/`** — Sản phẩm + biến thể. Index qua `products/elastic.ex`.
- **`variations/`** — Tổ hợp biến thể.
- **`product_comments/`, `product_reviews/`, `product_measurements/`** — Nội dung do user gửi + thông số.
- **`categories/`, `tags/`, `ribbons/`** — Taxonomy + nhãn.
- **`combo_products/`, `bonus_products/`** — Bundle + khuyến mãi.
- **`personal_product_designs/`** — Sản phẩm customise theo khách.
- **`materials/`, `shapes/`** — Thuộc tính (trang sức, quà tặng).
- **`catalogs/`** — Upload catalog tổng quát; mỗi nền tảng có sub-domain riêng: `fb_catalogs/`, `tiktok_catalog_products/`, `google_merchant/`.
- **`collections/`** — Bộ sưu tập.
- **`device_templates/`** — Theme template hiển thị trong Editor.

## Đơn hàng và thanh toán

- **`orders/`** — Đơn, trạng thái, fulfillment.
- **`order_transactions/`** — Giao dịch gắn với đơn.
- **`customer_invoices/`** — Hoá đơn.
- **`payments/`, `payment_accounts/`** — Cấu hình thanh toán (Stripe, COD, MoMo, ZaloPay,…).
- **`transactions_bank/`** — Đối soát ngân hàng.
- **`packages/`, `package_subscriptions/`** — Gói cước và subscription.
- **`promotion_advances/`** — Voucher nâng cao.
- **`cart_triggers/`** — Sự kiện giỏ hàng (abandon, recover).
- **`appointments/`** — Lịch hẹn cho dịch vụ.

## Khách hàng và marketing

- **`customers/`** — Khách mua hàng.
- **`contacts/`, `subscribers/`** — Lead, mailing list.
- **`customer_levels/`** — Hạng loyalty.
- **`commissions/`, `affiliates/`, `user_affiliates/`, `percent_com_for_sale/`** — Affiliate / hoa hồng.
- **`automations/`** — Trigger + action.
- **`notifications/`** — Push, in-app, web-push.
- **`send_email/`** — Email transactional (dùng Bamboo).

## Tích hợp

- **`integrations/`** và **`intergrations/`** — cả hai tên đều tồn tại do lịch sử.
- **`partner_services/`** — Đối tác vận chuyển / fulfillment / AI.
- **`merchant_syncs/`, `sync_pos/`** — Đồng bộ POS / merchant.
- **`google_ad_accounts/`, `google_ad_transactions/`** — Google Ads.
- **`google_merchant/`** — Feed Google Merchant.
- **`fb_catalogs/`, `tiktok_catalog_products/`** — Feed Meta / TikTok.
- **`zalo_mini_app/`** — Endpoint Zalo mini app.
- **`course_app/`** — Nền tảng khoá học.
- **`webcake/`** — Tích hợp với `landing_page_backend`.
- **`agents/`, `ai/`, `qwik/`** — AI assistant nội bộ.

## Nội dung

- **`blogs/`, `templates/`, `global_sources/`**
- **`cms_files/`** — Lưu trữ file (backend S3).
- **`tinymces/`** — Bản nháp TinyMCE.
- **`form_data/`** — Form động.
- **`builder_data_grids/`** — Data grid cho admin.
- **`translations/`, `languages.ex`, `locale.ex`** — i18n cho storefront.
- **`images/`, `photos/`, `videos/`, `hls/`, `fonts/`** — Media và streaming.

## Logistics

- **`geo/`** — Tỉnh / huyện / xã (cả bảng cũ và mới).
- **`shippings/`** — Cấu hình vận chuyển.
- **`warehouses/`** — Kho.
- **`block_phone_numbers/`, `phone_detect.ex`** — Anti-abuse.

## Audit và tracking

- **`system_logs/`**, **`system_log_rollback.ex`**
- **`error_sync_logs/`**
- **`trackings/`**, **`short_links/`**
- **`transaction_task.ex`**, **`transaction_task_supervisor.ex`**

## Helper hạ tầng

- `repo.ex`, `custom_ecto.ex`, `parse.ex`, `request.ex`, `validator.ex`, `guards.ex`
- `tools.ex`, `traversal.ex`, `statics.ex`, `time_util.ex`, `url`, `types`
- `ecto_middleware.ex`, `enum.ex`, `cache_manifest.ex`
- `default_theme.ex`, `default_data/`
- `mailer.ex`, `image_resize.ex`, `aws_s3.ex`
- `elastic.ex`, `elastic_index.ex`
- `redlock.ex` (distributed lock qua Redis)

## Quy tắc giữa các domain

- Domain A cần dữ liệu của B → gọi context của B, không truy vấn trực tiếp bảng của B.
- Khi A ghi và muốn thông báo cho domain khác → ghi vào **Outbox** (`lib/outbox/`) trong cùng transaction. Dispatcher chịu trách nhiệm phát ra queue.
- Tránh phụ thuộc vòng: nếu hai domain trao đổi event qua lại, tách module `events` riêng và phát qua PubSub / Outbox.
- Index Elastic chạy bất đồng bộ qua `Rabbit.IndexingConsumer` — không block request.

## Ví dụ

```elixir
defmodule BuilderxApi.Products do
  alias BuilderxApi.{Repo, Products.Product, Outbox}

  def create(site_id, attrs) do
    Repo.transaction(fn ->
      changeset =
        %Product{}
        |> Product.changeset(Map.put(attrs, :site_id, site_id))

      with {:ok, product} <- Repo.insert(changeset),
           {:ok, _} <- Outbox.publish("product.created", %{id: product.id, site_id: site_id}) do
        product
      else
        {:error, reason} -> Repo.rollback(reason)
      end
    end)
  end
end
```

Các subscriber trong `lib/rabbit/` / `lib/kafka/` consume các event này để cập nhật search index hoặc đẩy ra hệ thống bên ngoài.
