# Decap CMS — Setup Guide

Sau khi setup xong, vào `https://<your-domain>/admin/` để edit docs trên web (giống GitBook). Mỗi lần save = commit lên GitHub = Vercel tự deploy.

## 1. Tạo GitHub OAuth App

1. Vào [github.com/settings/developers](https://github.com/settings/developers) → **OAuth Apps** → **New OAuth App**.
2. Điền:
   - **Application name**: `Webcake Docs CMS`
   - **Homepage URL**: `https://<your-domain>` (tạm dùng URL Vercel `*.vercel.app` nếu chưa có custom domain)
   - **Authorization callback URL**: `https://<your-domain>/api/callback`
3. **Register application** → ghi nhớ **Client ID** và **Generate a new client secret** → ghi nhớ **Secret** (chỉ hiện 1 lần).

## 2. Set env vars trên Vercel

Vercel project → **Settings → Environment Variables** → Add:

| Name | Value |
|------|-------|
| `OAUTH_GITHUB_CLIENT_ID` | Client ID từ bước 1 |
| `OAUTH_GITHUB_CLIENT_SECRET` | Client Secret từ bước 1 |

Chọn cả 3 environment (Production, Preview, Development) → Save.

Sau khi add env vars → **Deployments** → click latest → **Redeploy** để function lấy được env mới.

## 3. Cập nhật `base_url` trong config

Mở `website/static/admin/config.yml`, đổi 2 dòng:

```yaml
base_url: https://docs.example.com    # ← URL thật của site
site_url: https://docs.example.com
display_url: https://docs.example.com
```

Commit + push.

## 4. Test

1. Mở `https://<your-domain>/admin/`
2. Click **Login with GitHub** → authorize app
3. Vào dashboard CMS → thấy các collections: Top-level pages, Storecake Builder, Storecake API, Webcake API
4. Edit thử 1 file → **Publish** → GitHub có commit mới → Vercel rebuild.

## Editorial workflow

Config dùng `publish_mode: editorial_workflow` → các bản edit sẽ tạo **draft branch + PR** trên GitHub thay vì commit thẳng vào `main`. Lợi: review trước khi publish.

Nếu muốn commit thẳng (đơn giản hơn cho team nhỏ), xoá dòng `publish_mode: editorial_workflow` trong `config.yml`.

## Phân quyền

Chỉ những GitHub user có quyền **write** vào repo `vuluu2k/storecake_dev_docs` mới login vào CMS được. Add collaborator trong **GitHub repo → Settings → Collaborators**.

## Troubleshooting

- **"Failed to load config.yml"** → check file `website/static/admin/config.yml` có deploy không (`https://<domain>/admin/config.yml` mở được không).
- **OAuth popup trắng / lỗi state** → check env vars trong Vercel đã set chưa; redeploy lại.
- **"Bad credentials"** khi save** → token GitHub thiếu scope, kiểm tra OAuth App có scope `repo`.
- **Vercel function không deploy** → check Vercel project có `website` làm Root Directory; folder `website/api/` phải nằm đúng đó.
