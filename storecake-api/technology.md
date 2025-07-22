# Technology

## BuilderxApi

BuilderxApi is a powerful backend API built on the [Phoenix Framework](https://www.phoenixframework.org/) (Elixir), designed for product, order, account management systems, multi-service integration, and real-time/websocket support.

### 🚀 Key Features

* RESTful API for multiple domains: products, orders, accounts, blogs, partner integrations, and more
* Real-time support (WebSocket, Phoenix Channels)
* Integrations: ElasticSearch, Redis, RabbitMQ, Kafka, S3, SMTP, etc.
* Role-based access control, OAuth & JWT authentication
* Multi-language, multi-site, multi-service support
* CI/CD ready, Docker, Ansible, Makefile for development and deployment

### 🛠 System Requirements

* Elixir >= 1.12.2
* Erlang/OTP >= 24
* Node.js >= 14 (for frontend/assets)
* PostgreSQL (Citus)
* Docker, Docker Compose (recommended)
* Redis, RabbitMQ, ElasticSearch (for full feature set)

### 🗂 Project Structure

* `/lib/builderx_api/` - Business logic: products, orders, accounts, integrations, etc.
* `/lib/builderx_api_web/` - Web layer: controllers, routers, channels, views, plugs
* `/assets/` - Frontend assets (Vue 3, Ant Design Vue, Webpack)
* `/priv/repo/` - Database migrations and seeds
* `/test/` - Test code
* `/ansible/` - Deployment automation scripts
* `Makefile` - Quick development, deployment, migration commands

### ⚙️ Quick Development Commands (Makefile)

* `make build` - Rebuild Docker image
* `make app` - Run the app in Docker
* `make services` - Start supporting services (Redis, RabbitMQ, ...)
* `make migrate` - Run DB migrations inside the container
* `make deploy` - Deploy to production via Ansible
* `make dev` - Run in development mode (hot reload)
* `make bash` - Access bash inside the container
