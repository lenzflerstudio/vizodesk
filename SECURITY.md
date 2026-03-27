# Security notes for maintainers

## Before pushing to GitHub

1. **Never commit** `.env`, `.env.local`, or real `*.db` files. They are listed in `.gitignore`.
2. **Rotate secrets** if they were ever committed: `JWT_SECRET`, `SQUARE_ACCESS_TOKEN`, `SQUARE_WEBHOOK_SIGNATURE_KEY`.
3. **Square**: only `SQUARE_ACCESS_TOKEN` and webhook signing material live on the server — never in the admin or portal frontends.
4. **JWT**: set `JWT_SECRET` in production; the server refuses to start without it when `NODE_ENV=production`.

## Template files

- `server/.env.example`, `client/.env.example`, `portal/.env.example` contain **placeholders only**.
- `database/schema.sql` uses `system@example.invalid` for a non-login seed row (filtered at import in `server/db.js`).

## Auditing

Search the repo (excluding `node_modules`) for accidental leaks:

`rg -i "sk_live|sk_test_[0-9a-zA-Z]{20,}|Bearer [A-Za-z0-9_-]{20,}" --glob '!node_modules'`
