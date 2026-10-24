# Production deployment

ZORONA is a monorepo with two separately deployed Node services:

- **Web**: public pages + API, port `3000`, health check `GET /health`, root Dockerfile `Dockerfile`.
- **Admin**: dashboard, port `4174`, health check `GET /health`, Dockerfile `apps/admin/Dockerfile`.

## Render deployment

A `render.yaml` Blueprint is included for a production web/API service, admin dashboard, and PostgreSQL. To create them, connect `zorona116-code/Zorona` in Render and choose **New → Blueprint Instance**. Review the prices and resource plans in Render before confirming creation; the services and durable PostgreSQL plan are paid resources.

Render prompts for these values because they are intentionally not stored in Git: `ARABISK_ADMIN_USERNAME`, `ARABISK_ADMIN_PASSWORD`, `AWS_ENDPOINT_URL`, `AWS_S3_BUCKET_NAME`, `AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY`. Use an existing S3-compatible bucket for uploads. The Blueprint generates independent `ARABISK_ADMIN_API_KEY` and `ARABISK_ADMIN_SESSION_SECRET` secrets. The web service receives its database connection from the managed PostgreSQL resource, checks TLS certificates, and allows CORS only from the admin service's external URL. The admin proxy uses the private service hostname `zorona-web:10000`, while links back to the public site use the public URL.

After creating the Blueprint, inspect each service's Deploys page. Do not accept reservations until the web health endpoint reports `ok: true`, `databaseConfigured: true`, and `persistentStoreConfigured: true`, and the admin `/health` endpoint reports `ok: true`, `authConfigured: true`, and `webApiConfigured: true`. Then test sign-in, menu editing, today's offer, and reservation create/read-back.

## Before going live

1. Push this repository to GitHub and wait for the `CI` workflow to pass. It runs locked dependency installation, repository hygiene, JavaScript syntax verification, unit tests, both frontend builds, and API smoke tests on Node 24.
2. Create a production PostgreSQL instance. Set `DATABASE_URL` on **web**. Production readiness deliberately fails closed if durable PostgreSQL state is not configured or the database check fails. Do not rely on local process memory for reservations, products, categories, or promotions.
3. Create an S3-compatible bucket for uploaded media. Configure `AWS_ENDPOINT_URL`, `AWS_DEFAULT_REGION`, `AWS_S3_BUCKET_NAME`, `AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY` on **web**. Keep all values in the hosting provider's secret/environment-variable store.
4. Generate separate random secrets for `ARABISK_ADMIN_PASSWORD`, `ARABISK_ADMIN_API_KEY` (at least 32 random characters), and `ARABISK_ADMIN_SESSION_SECRET`. Set them on **admin**. Do not reuse the API key as the password/session secret.
5. In the hosting dashboard, create a **web** service connected to this GitHub repo using `Dockerfile` from the repository root. Enable a public domain. Set `PORT=3000` only if the platform does not inject it (Railway injects `PORT` automatically).
6. Create an **admin** service from the same repository and set its Dockerfile path to `apps/admin/Dockerfile` with the repository root as the build context. Enable a public domain only if the dashboard needs to be internet-accessible; use strong credentials and HTTPS.
7. Set `ARABISK_WEB_API_URL` on admin to the public web URL (for links). For service-to-service requests on Railway, set `ARABISK_WEB_API_PRIVATE_DOMAIN` and `ARABISK_WEB_API_PRIVATE_PORT` to the web service's private hostname and port (default app configuration expects `web.railway.internal:8080`). Verify those values against the actual service/network settings; service names and private ports can differ.
8. Set `ARABISK_CORS_ORIGINS` on web to the exact HTTPS origin of admin, without paths and with no trailing slash. For example: `https://your-admin-domain.example`.
9. Wait for deployment success and verify `https://<web-domain>/health` returns HTTP 200 with `ok: true`, `databaseConfigured: true`, and `persistentStoreConfigured: true`. Verify the admin `/health` returns HTTP 200; then test login, product/category editing, offer update, and reservation creation/read-back.

## Railway notes

Connect the GitHub repository to Railway and configure each service as above. Keep the project root (`/`) as the build context for both services. Railway's dashboard has the active source/deploy configuration; do not copy a `railway.toml` file into this repository because Railway now marks Config-as-Code as deprecated for new services. Use Dockerfile paths in service settings, or a Railway Infrastructure-as-Code project file only when the connected Railway project and resource names are confirmed.

## Rollback and data safety

- Keep PostgreSQL backups enabled before accepting real reservations.
- Use GitHub commits / pull requests for code rollback; roll back the deploy to the last known-good image if health checks fail.
- Never run destructive schema changes or overwrite production media during routine code deployments.
- Do not add `.env`, production database URLs, storage credentials, or generated keys to Git.
