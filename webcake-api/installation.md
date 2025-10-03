# Installation

### 1. Run docker build app

```bash
docker compose build landing-page
```

### 2. Run app services

```bash
make app
```

or

```bash
make dev
```

### 3. Run install package FE

```bash
make bash
```

```bash
mix ecto.setup
```

```bash
cd ./assets && npm install
```
