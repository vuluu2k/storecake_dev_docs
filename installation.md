# Installation

### 🛠️ Installation

1. Clone repository:

```bash
git clone git@github.com:pancake-vn/builderx_spa.git
cd builderx_spa
```

2. Install dependencies:

```bash
npm install
# or
yarn install
```

3. Create .env file from .env.example and configure necessary environment variables

### 🚀 Running the Project

#### Development

```bash
npm run dev
# or
yarn dev
```

#### Production Build

```bash
npm run build:client
# or
yarn build:client
```

### 📝 Useful Commands

* `npm run dev`: Run development server
* `npm run watch`: Run server with nodemon (auto-reload)
* `npm run build:client`: Build frontend for production
* `npm run clean`: Clean dist directory
* `npm run lint`: Check and fix code
* `npm run format`: Format code with Prettier
* `npm run setup:husky`: Setup husky rule

### 🐳 Docker

1. Run project

```bash
make dev
```

2. Access bash

```bash
make bash
```
