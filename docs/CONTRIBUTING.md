# Maintaining ZORONA

## Everyday change loop

1. Create a short branch for one feature or fix.
2. Keep business logic in `apps/web/services`, persistence adapters in `apps/web/repositories` / `apps/web/db.js`, HTTP mappings in `apps/web/routes`, and page assets in `apps/web`.
3. Add or update a focused regression test in `tests/` whenever a defect is fixed.
4. Before pushing, run:

   ```sh
   npm ci
   npm run verify:syntax
   npm test
   npm run build
   npm run smoke
   ```

5. Open a pull request, check the `CI` workflow, and merge only when it passes.
6. Deploy from `main`; verify health and critical user journeys after deployment.

## Coding rules

- Prefer small, reversible changes over broad rewrites.
- Preserve the Arabic/English experience and verify RTL layouts on mobile and desktop.
- Put secrets in environment variables. Never commit `.env` files or production credentials.
- Do not return success for a write that did not reach durable storage in production.
- Keep PostgreSQL as the source of truth for business state and S3-compatible object storage for media.
- Update `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, and `docs/DEPLOYMENT.md` when operational behavior changes.
