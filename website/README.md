# Website

Site này được xây dựng bằng [Docusaurus](https://docusaurus.io/), một static site generator hiện đại.

## Cài đặt

```bash
yarn
```

## Chạy local

```bash
yarn start
```

Lệnh này khởi động dev server và mở trình duyệt. Phần lớn thay đổi được phản ánh ngay (live reload) mà không cần restart server.

## Build

```bash
yarn build
```

Lệnh này build site ra static HTML trong thư mục `build/`, có thể deploy lên bất kỳ static hosting nào.

## Deploy

Dùng SSH:

```bash
USE_SSH=true yarn deploy
```

Không dùng SSH:

```bash
GIT_USER=<GitHub username của bạn> yarn deploy
```

Nếu host trên GitHub Pages, lệnh này sẽ build và push lên branch `gh-pages` luôn.
