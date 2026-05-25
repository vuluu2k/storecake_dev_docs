# Domains

Tài liệu mô tả các **bounded context** chính trong `lib/builderx_api/`. Mỗi context là một module Elixir kèm Ecto schema + business function. Quy ước: bên ngoài chỉ gọi context, không chạm Repo trực tiếp.

## Accounts & Auth

* **`accounts/`** – User, account, password, profile.
  * `BuilderxApi.Accounts.create_account/1`, `get_account_by_email/1`, `authenticate/2`.
  * Hash password bằng Argon2.
* **`api_keys/`** – Token cho developer integration.
* **`invitations/`** – Mời member vào account.
* **`otp_codes/`** – Mã OTP gửi qua email/SMS.
* **`permissions/`** – Role + permission RBAC. Plug `BuilderxApiWeb.Plugs.Permission` kiểm tra.
* **`super_admin/`** – Tài khoản nội bộ Storecake, có route riêng `super_admin_controller`.

## Sites & Domain

* **`sites/`** – Multi-tenant unit. Tất cả dữ liệu bán hàng đều scope qua `site_id`.
* **`domains/`** – Custom domain (verify TXT, SSL).
* **`pages/`** – Page CMS gắn vào site.
* **`seos/`** – SEO meta theo page/product.
* **`sitemaps/`** – Generate sitemap động.
* **`pwas/`** – PWA manifest theo site.
* **`site_styles/`** – Theme tuỳ biến.
* **`site_products/`, `site_tag/`, `site_utms/`** – Mapping phụ trợ.

## Catalog (sản phẩm)

* **`products/`** – Core product + variant. Index lên Elastic qua `products/elastic.ex`.
* **`variations/`** – Combination biến thể.
* **`product_comments/`, `product_reviews/`, `product_measurements/`** – UGC + spec.
* **`categories/`, `tags/`, `ribbons/`** – Taxonomy & label.
* **`combo_products/`, `bonus_products/`** – Bundle / promotion.
* **`personal_product_designs/`** – Sản phẩm customise theo khách.
* **`materials/`, `shapes/`** – Thuộc tính cho sản phẩm trang sức / quà tặng.
* **`catalogs/`** – Catalog upload chung; sub-domain riêng cho từng platform: `fb_catalogs/`, `tiktok_catalog_products/`, `google_merchant/`.
* **`collections/`** – Curated collection.
* **`device_templates/`** – Theme template UI dùng bởi Editor.

## Orders & Payments

* **`orders/`** – Đơn hàng, status, fulfillment.
* **`order_transactions/`** – Giao dịch gắn với order.
* **`customer_invoices/`** – Hoá đơn xuất.
* **`payments/`, `payment_accounts/`** – Cấu hình thanh toán (Stripe, Cod, ZaloPay, MoMo, …).
* **`transactions_bank/`** – Đối soát ngân hàng.
* **`packages/`, `package_subscriptions/`** – Gói dịch vụ + subscription.
* **`promotion_advances/`** – Voucher nâng cao.
* **`cart_triggers/`** – Sự kiện giỏ hàng (abandon, recover).
* **`appointments/`** – Lịch hẹn (dịch vụ).

## Customer & Marketing

* **`customers/`** – End-customer mua sắm.
* **`contacts/`, `subscribers/`** – Lead, mailing list.
* **`customer_levels/`** – Hạng thành viên, loyalty.
* **`commissions/`, `affiliates/`, `user_affiliates/`, `percent_com_for_sale/`** – Affiliate / commission.
* **`automations/`** – Automation flow (trigger + action).
* **`notifications/`** – Push, in-app, web push.
* **`send_email/`** – Email transactional (sử dụng Bamboo).

## Integrations

* **`integrations/`** + **`intergrations/`** (folder lịch sử, vẫn được compile – cẩn thận chính tả).
* **`partner_services/`** – Đối tác (shipping, fulfillment, AI).
* **`merchant_syncs/`, `sync_pos/`** – Đồng bộ POS / merchant.
* **`google_ad_accounts/`, `google_ad_transactions/`** – Google Ads.
* **`google_merchant/`** – Google Merchant feed.
* **`fb_catalogs/`, `tiktok_catalog_products/`** – Feed Meta / TikTok.
* **`zalo_mini_app/`** – Endpoint dành cho Zalo mini app.
* **`course_app/`** – App khoá học.
* **`webcake/`** – Tích hợp với `landing_page_backend`.
* **`agents/`, `ai/`, `qwik/`** – AI assistant nội bộ.

## Content

* **`blogs/`** – Bài viết blog.
* **`templates/`** – Template dùng cho Editor.
* **`global_sources/`** – Asset/section global tái sử dụng.
* **`cms_files/`** – Tài nguyên file CMS (S3 backed).
* **`tinymces/`** – Lưu draft TinyMCE.
* **`form_data/`** – Dynamic form (collect lead).
* **`builder_data_grids/`** – Data grid cho admin.
* **`translations/`** – Khoá dịch dùng cho storefront (đa ngôn ngữ).
* **`languages.ex` / `locale.ex`** – Helper i18n.
* **`images/`, `photos/`, `videos/`, `hls/`, `fonts/`** – Media + streaming.

## Logistics

* **`geo/`** – Tỉnh/huyện/xã (mới + cũ – import script ở `Run book`).
* **`shippings/`** – Cấu hình vận chuyển.
* **`warehouses/`** – Kho.
* **`block_phone_numbers/`** – Black-list phone.
* **`phone_detect.ex`** – Detect SĐT.

## Audit & Tracking

* **`system_logs/`** – Audit log thao tác.
* **`system_log_rollback.ex`** – Hỗ trợ rollback dữ liệu.
* **`error_sync_logs/`** – Log sync error.
* **`trackings/`** – Pixel/tracking.
* **`short_links/`** – Rút gọn link.
* **`transaction_task.ex`, `transaction_task_supervisor.ex`** – Task transactional song song.

## Helpers / Infra

* `repo.ex`, `custom_ecto.ex`, `parse.ex`, `request.ex`, `validator.ex`, `guards.ex`
* `tools.ex`, `traversal.ex`, `statics.ex`, `time_util.ex`, `url`, `types`
* `ecto_middleware.ex`, `enum.ex`, `cache_manifest.ex`
* `default_theme.ex`, `default_data/` – Seed data.
* `mailer.ex`, `image_resize.ex`, `aws_s3.ex`
* `elastic.ex`, `elastic_index.ex`
* `redlock.ex` (distributed lock qua Redis).

## Quy tắc giữa các domain

* Domain A cần data từ domain B → gọi context B (không query trực tiếp bảng của B).
* Khi domain A tạo entity và muốn báo cho domain khác → ghi vào **Outbox** (`lib/outbox/`), không gọi Rabbit trực tiếp trong transaction.
* Tránh circular dependency: nếu hai domain hoán đổi event → tạo module `events` riêng và publish qua PubSub/Outbox.
* Index Elastic làm async qua Rabbit consumer (`Rabbit.IndexingConsumer`), tránh block request.

## Mẫu code

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

* Outbox dispatcher chạy ngoài request → đẩy event vào Rabbit/Kafka và (nếu cần) gọi Webhook subscriber.
* Subscribers ở `lib/rabbit/` / `lib/kafka/` consume và re-publish hoặc cập nhật search index.
