# Installation

⚡️ Setup & Getting Started

#### 1. Clone the repository

```bash
git clone https://github.com/your-org/builderx_api.git
cd builderx_api
```

#### 2. Build docker app

```bash
make build
```

#### 3. Run dev (hot reload)

```bash
make dev
```

#### 4. Run bash

```bash
make bash
```

#### 5. Install library and setup database

```bash
mix deps.get
mix ecto.setup
```

#### 6. Install Node.js dependencies for frontend/assets

```bash
cd assets
npm install
cd ..
```

