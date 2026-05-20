# Deploy Guide

Site được build ra **static HTML** trong `website/build/`. Có thể deploy lên bất kỳ static host nào. Dưới đây là 3 lựa chọn phổ biến.

## Local commands

```bash
cd website
npm install        # cài lần đầu
npm run start      # dev server tại http://localhost:3000
npm run build      # build production vào website/build/
npm run serve      # serve thư mục build/ để test
```

---

## Option 1 — Cloudflare Pages (khuyến nghị, free + custom domain dễ nhất)

1. Push repo lên GitHub.
2. Vào [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. Chọn repo `storecake_dev_docs`.
4. Build settings:
   - **Framework preset**: `Docusaurus`
   - **Build command**: `cd website && npm install && npm run build`
   - **Build output directory**: `website/build`
   - **Root directory**: để trống (hoặc `/`)
5. Deploy. Cloudflare cấp domain `*.pages.dev`.
6. Custom domain:
   - Trong project Pages → **Custom domains** → **Set up a custom domain**
   - Nhập domain (ví dụ `docs.storecake.com`)
   - Nếu DNS đã ở Cloudflare → CNAME tự được thêm; nếu khác → thêm `CNAME docs → <project>.pages.dev` ở DNS provider của bạn.
   - SSL miễn phí, tự bật.
7. Update `docusaurus.config.ts`:
   ```ts
   url: 'https://docs.storecake.com',
   baseUrl: '/',
   ```

> **Push để deploy**: mỗi commit lên branch chính sẽ auto-build + deploy. Preview build cho mỗi PR.

---

## Option 2 — Vercel (cũng rất gọn)

1. [vercel.com/new](https://vercel.com/new) → import repo.
2. **Root Directory**: `website`
3. Preset auto-detect Docusaurus.
4. Build command: `npm run build` — Output: `build`
5. Deploy → có domain `*.vercel.app`.
6. **Settings → Domains** → thêm custom domain → làm theo hướng dẫn DNS.

---

## Option 3 — GitHub Pages (miễn phí, nằm cùng repo)

### 3.1. Cập nhật config

Trong `website/docusaurus.config.ts`:

```ts
url: 'https://<your-github-user>.github.io',
baseUrl: '/storecake_dev_docs/',   // tên repo, có dấu '/' cuối
organizationName: '<your-github-user>',
projectName: 'storecake_dev_docs',
```

> Nếu repo tên `<user>.github.io` thì `baseUrl: '/'`.

### 3.2. Workflow tự deploy

Tạo `.github/workflows/deploy.yml` (ở root repo, không phải trong website/):

```yaml
name: Deploy Docusaurus to GitHub Pages

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ./website
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: website/package-lock.json
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: website/build

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

### 3.3. Bật Pages

GitHub repo → **Settings → Pages → Source: GitHub Actions**. Push lên main, workflow tự chạy.

### 3.4. Custom domain

- Trong **Settings → Pages → Custom domain** → nhập `docs.storecake.com` → Save.
- File `website/static/CNAME` chứa nội dung `docs.storecake.com` (một dòng) — Docusaurus sẽ copy vào build output.
- DNS provider: thêm `CNAME docs → <user>.github.io`.
- Sau khi DNS lan, tick **Enforce HTTPS**.
- Trong config đổi:
  ```ts
  url: 'https://docs.storecake.com',
  baseUrl: '/',
  ```

---

## Self-host (VPS / Docker)

Nếu muốn tự host:

```bash
cd website
npm ci && npm run build
# website/build/ là static — serve bằng nginx
```

Cấu hình nginx tối giản:

```nginx
server {
  listen 80;
  server_name docs.storecake.com;
  root /var/www/storecake-docs;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

SSL: dùng [certbot](https://certbot.eff.org/) lấy Let's Encrypt miễn phí.

---

## Sau khi deploy xong

- Cập nhật `url` và `baseUrl` trong `docusaurus.config.ts` cho khớp domain thực tế.
- Cập nhật `organizationName` / `projectName` / `editUrl` nếu muốn nút **Edit this page** hoạt động.
- Có thể bật search (Algolia DocSearch miễn phí cho project open-source: [docsearch.algolia.com/apply](https://docsearch.algolia.com/apply)).
