# ZORONA Restaurant & Cafe

A bilingual Arabic/English restaurant website and administration dashboard, styled around ZORONA's real-world identity: charcoal, wood brown, warm stone, ivory, and champagne gold.

## Apps

- `apps/web` — customer-facing pages, menu and offers, reservations, Express API, PostgreSQL-backed business state, and S3-compatible media.
- `apps/admin` — authenticated administration dashboard for categories, products, reservations, and today's offer.

## Requirements

- Node.js 24.x and npm (the exact dependency graph is locked in `package-lock.json`).
- PostgreSQL for durable production business state.
- An S3-compatible bucket for uploaded media.

## Local development

```sh
npm ci
npm run dev:web      # public web app / API on port 3000
npm run dev:admin    # admin on port 4174
npm run verify:syntax
npm test
npm run build
npm run smoke
```

For local usage, copy `.env.example` to `.env` and enter only non-production values. Never commit secrets. See [deployment guide](docs/DEPLOYMENT.md), [architecture](docs/ARCHITECTURE.md), [database operations](docs/DATABASE.md), and [security baseline](docs/SECURITY.md).

## Deployment and releases

The GitHub Actions `CI` workflow runs on pushes and pull requests to `main`. Production deployment uses two services from the same repository: root `Dockerfile` for web and `apps/admin/Dockerfile` for the dashboard. `render.yaml` provisions the app services plus a durable PostgreSQL database; the deployment guide lists required secret values and post-deploy checks. Review hosting costs before creating resources. Configure media storage, admin credentials, and CORS before accepting real reservations. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

A release is considered live only after the hosting provider reports a successful deployment and post-deploy health checks and critical reservation/admin journeys pass.
