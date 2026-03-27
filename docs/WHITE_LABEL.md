# Self-hosted / white-label setup

Each deployment is independent: your domain, your Square account, your client portal URL.

## Client Portal URL

1. Deploy the **portal** app (`portal/`) to any static host (Vercel, Netlify, Cloudflare Pages, your own server).
2. In the **admin** app, open **Settings** and set **Client Portal URL** to that public base (e.g. `https://portal.yourbrand.com` or `https://yourapp.vercel.app`).
3. The value is stored in the database (`app_settings`) and used for:
   - Booking / client links copied from the admin app
   - Square Payment Link return URL (after card checkout)
4. If Settings is empty, the server falls back to **`PORTAL_URL`** in `server/.env` (useful for local development).

## CORS

The API allows requests from:

- Local dev (`localhost:5173`, `localhost:5174`)
- `CLIENT_URL` and `PORTAL_URL` from `server/.env`
- The origin of your saved **Client Portal URL**

After changing the portal URL in Settings, CORS refreshes automatically.

## Portal routes

All of these use the same **booking `public_token`**:

| Path | Purpose |
|------|--------|
| `/booking/:token` | Default link shared from the admin app |
| `/client/:token` | Alias |
| `/contract/:token` | Alias (contract + signing UI) |
| `/payment/:token` | Used for Square return URLs; same page as booking |

Configure `VITE_API_URL` on the portal build so browser calls reach your API (e.g. `https://api.yourbrand.com/api`).
