# Installation

### 1. Run docker build app

```
docker compose build landing-page
```

### 2. Run app services

```
make app
```

or

```
make dev
```

### 3. Run install package FE

```
make bash
```

```
mix ecto.setup
```

```
cd ./assets && npm install
```
