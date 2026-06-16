# ENV Migration Plan: Replace `src/config/env.js` with `dotenv`

## Overview

Remove the `src/config/env.js` abstraction and load environment variables directly via `dotenv` at the application entry point. All `env.*` references are replaced with `process.env.*` inline. SaaS plan configuration is moved into a seeded MongoDB collection so it can be read from the database at runtime.

---

## Steps

### Step 1 — Update `src/server.js`

- Add `import 'dotenv/config'` as the **very first line** so `.env` is loaded before any other module executes.
- Add an early-exit validation guard immediately after:
  - `MONGO_URL` must be present.
  - `JWT_SECRET` must be present.
  - If `NODE_ENV=production`, `CORS_ORIGINS` must contain at least one value.
  - On any failure: log a clear error message and call `process.exit(1)`.
- Replace `env.port` with `Number(process.env.PORT ?? 8080)`.

---

### Step 2 — Create `src/config/saasPlans.js`

- A `.js` module (not JSON) so computed values and `process.env` reads are supported.
- Defines a local `parseNumber(value, fallback)` helper.
- Exports a default object with 4 plan keys: `free`, `starter`, `professional`, `enterprise`.
- Each plan has: `id`, `name`, `max_users`, `max_clients`, `max_jobs`, `price_monthly`, `price_annual`.
- All values read from `PLAN_*` env vars with the same defaults currently in `env.js`.

```js
// Example shape
export default {
  free: {
    id: 'free',
    name: 'Free',
    max_users:     parseNumber(process.env.PLAN_FREE_MAX_USERS, 3),
    max_clients:   parseNumber(process.env.PLAN_FREE_MAX_CLIENTS, 20),
    max_jobs:      parseNumber(process.env.PLAN_FREE_MAX_JOBS, 50),
    price_monthly: parseNumber(process.env.PLAN_FREE_PRICE_MONTHLY, 0),
    price_annual:  parseNumber(process.env.PLAN_FREE_PRICE_ANNUAL, 0),
  },
  // starter, professional, enterprise ...
};
```

---

### Step 3 — Create `src/models/SaasPlan.js`

- Mongoose model with collection name `saas_plans`.
- Fields: `id` (String, unique, required), `name` (String), `max_users` (Number), `max_clients` (Number), `max_jobs` (Number), `price_monthly` (Number), `price_annual` (Number).

---

### Step 4 — Create `src/utils/saasPlansDb.js`

- Exports a single async helper: `getSaasPlansMap()`.
- Queries `SaasPlan.find({})` and returns a keyed object: `{ free: {...}, starter: {...}, ... }`.
- Keeps the DB query in one place (DRY) — used by any controller that needs plan limits.

```js
export const getSaasPlansMap = async () => {
  const plans = await SaasPlan.find({});
  return Object.fromEntries(plans.map((p) => [p.id, p.toObject()]));
};
```

---

### Step 5 — Update `src/utils/seedAdmin.js`

- **Remove** the redundant `import 'dotenv/config'` (dotenv is already loaded in `server.js` before this module runs).
- After seeding the admin user, loop over `saasPlans.js` entries and upsert each plan into the `SaasPlan` collection:
  ```js
  await SaasPlan.updateOne({ id: plan.id }, { $set: plan }, { upsert: true });
  ```
- This means every server boot syncs plan data from `.env` → DB automatically.
- Plans already in the DB are refreshed (not skipped), so changing a `PLAN_*` env var and restarting the server updates the DB.

---

### Step 6 — Update `src/controllers/saasController.js`

- Remove `import { env } from '../config/env.js'`.
- Import `getSaasPlansMap` from `../utils/saasPlansDb.js` and `SaasPlan` model.
- Replace `const PLAN_LIMITS = env.saasPlans` with `const PLAN_LIMITS = await getSaasPlansMap()` at the top of each handler that needs plan limits (`getPlans`, `registerOrganisation`, `createSubscription`).
- Replace `env.saasTrialDays` with `Number(process.env.SAAS_TRIAL_DAYS ?? 14)`.
- Replace `env.authCookieName` with `process.env.AUTH_COOKIE_NAME ?? 'access_token'`.

---

### Step 7 — Update `src/controllers/authorizationController.js`

- Remove `import { env } from '../config/env.js'`.
- Replace `env.jwtPurposeSecret` with `process.env.JWT_PURPOSE_SECRET ?? process.env.JWT_SECRET`.
- Replace `env.inviteTokenTtl` with `process.env.INVITE_TOKEN_TTL ?? '48h'`.

---

### Step 8 — Update `src/config/cors.js`

- Remove `import { env } from './env.js'`.
- Inline the comma-split helper at module level:
  ```js
  const corsOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  ```
- Use `corsOrigins` in the existing `origin` callback.

---

### Step 9 — Update `src/app.js`

- Remove `import { env } from './config/env.js'`.
- Replace `env.allowDestructiveRoutes` with:
  ```js
  const allowDestructiveRoutes =
    ['1','true','yes','on'].includes(String(process.env.ALLOW_DESTRUCTIVE_ROUTES).toLowerCase());
  ```
- Replace `env.nodeEnv` with `process.env.NODE_ENV`.

---

### Step 10 — Update `src/utils/jwt.js`

- Remove `import { env } from '../config/env.js'`.
- Replace all `env.*` cookie/jwt fields with `process.env.*` inline:

| `env.*` key         | Replacement                                               |
|---------------------|-----------------------------------------------------------|
| `env.jwtSecret`     | `process.env.JWT_SECRET`                                  |
| `env.jwtExpiresIn`  | `process.env.JWT_EXPIRES_IN ?? '7d'`                      |
| `env.authCookieName`| `process.env.AUTH_COOKIE_NAME ?? 'access_token'`          |
| `env.cookieSecure`  | `['1','true','yes','on'].includes(String(process.env.COOKIE_SECURE))` |
| `env.cookieSameSite`| `process.env.COOKIE_SAME_SITE ?? 'lax'`                   |
| `env.cookieDomain`  | `process.env.COOKIE_DOMAIN \|\| undefined`                |

---

### Step 11 — Update remaining controllers

Replace `env` imports with `process.env.*` in all other files that still import `env`:

| File | `env.*` keys used |
|------|-------------------|
| `src/controllers/authController.js` | `env.jwtSecret`, `env.appBaseUrl`, `env.enableDemoLogin`, `env.demoAccount*`, `env.verifyEmailTokenTtl`, `env.resetPasswordTokenTtl` |
| `src/controllers/settingsController.js` | `env.smtpHost`, `env.smtpPort`, `env.smtpUser` (or similar) |
| `src/config/db.js` | `env.mongoUrl` |

---

### Step 12 — Delete `src/config/env.js`

Once all references are removed and the application starts cleanly, delete `src/config/env.js`.

---

## Env Var Reference Table

| Variable | Used In | Default |
|----------|---------|---------|
| `MONGO_URL` | `server.js` (guard), `config/db.js` | — (required) |
| `JWT_SECRET` | `server.js` (guard), `utils/jwt.js` | — (required) |
| `JWT_EXPIRES_IN` | `utils/jwt.js` | `7d` |
| `JWT_PURPOSE_SECRET` | `authorizationController.js` | falls back to `JWT_SECRET` |
| `INVITE_TOKEN_TTL` | `authorizationController.js` | `48h` |
| `VERIFY_EMAIL_TOKEN_TTL` | `authController.js` | `24h` |
| `RESET_PASSWORD_TOKEN_TTL` | `authController.js` | `30m` |
| `PORT` | `server.js` | `8080` |
| `NODE_ENV` | `server.js`, `app.js` | `development` |
| `CORS_ORIGINS` | `config/cors.js` | — (required in production) |
| `APP_BASE_URL` | `authController.js` | `http://localhost:5173` |
| `AUTH_COOKIE_NAME` | `utils/jwt.js` | `access_token` |
| `COOKIE_SECURE` | `utils/jwt.js` | `false` |
| `COOKIE_SAME_SITE` | `utils/jwt.js` | `lax` |
| `COOKIE_DOMAIN` | `utils/jwt.js` | `undefined` |
| `SAAS_TRIAL_DAYS` | `saasController.js` | `14` |
| `PLAN_FREE_*` | `config/saasPlans.js` | see defaults |
| `PLAN_STARTER_*` | `config/saasPlans.js` | see defaults |
| `PLAN_PROFESSIONAL_*` | `config/saasPlans.js` | see defaults |
| `PLAN_ENTERPRISE_*` | `config/saasPlans.js` | see defaults |
| `ALLOW_DESTRUCTIVE_ROUTES` | `app.js` | `false` |
| `SMTP_HOST` | `services/emailService.js` | `''` |
| `SMTP_PORT` | `services/emailService.js` | `587` |
| `SMTP_SECURE` | `services/emailService.js` | `false` |
| `SMTP_USER` | `services/emailService.js` | `''` |
| `SMTP_PASS` | `services/emailService.js` | `''` |
| `SMTP_FROM_EMAIL` | `services/emailService.js` | `no-reply@localhost` |
| `ENABLE_DEMO_LOGIN` | `authController.js` | `true` (non-production) |
| `DEMO_ACCOUNT_EMAIL` | `authController.js` | `demo@example.com` |
| `DEMO_ACCOUNT_PASSWORD` | `authController.js` | `Demo@12345678` |
| `DEMO_ACCOUNT_NAME` | `authController.js` | `Demo Admin` |

---

## Notes

- **Boot-time plan sync**: Every restart upserts plan data from `.env` → `SaasPlan` collection. Changing a `PLAN_*` env var and restarting will automatically update the DB — no manual migration needed.
- **No plan editing UI** in scope for this migration.
- **`seedAdmin.js`** no longer loads dotenv itself — it relies on `server.js` having loaded it first. If `seedAdmin.js` is ever run standalone (e.g. as a one-off script), it will need its own `dotenv` load added back at that time.
