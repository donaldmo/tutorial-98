# Implementation Plan: Auto-seed Admin + Per-Org Email Config + Tenant→Organisation Rename

**Date:** 26 April 2026  
**Status:** Approved — ready for implementation

---

## `.env` additions required before next server start

```dotenv
ADMIN_NAME=...           # required — hard-fail if missing
ADMIN_EMAIL=...          # required — hard-fail if missing
ADMIN_PASSWORD=...       # required — hard-fail if missing
ENCRYPTION_KEY=...       # must be exactly 32 characters (AES-256-GCM)
```

---

## Phase 1 — Rename Tenant → Organisation

### 1. Rename `src/models/Tenant.js` → `src/models/Organisation.js`
- Rename schema variable `tenantSchema` → `organisationSchema`
- Rename model `Tenant` → `Organisation`
- Change `collection: 'tenants'` → `collection: 'organisations'`
- Keep all existing fields as-is

### 2. Update `ref` and field names across all models
Change `ref: 'Tenant'` → `ref: 'Organisation'` and `tenant_id` → `organisation_id` in:
- `src/models/Staff.js`
- `src/models/Job.js`
- `src/models/Allocation.js`
- `src/models/MonthlySnapshot.js`
- `src/models/Notification.js`
- `src/models/Webhook.js`
- `src/models/WorkingDayCalendar.js`
- `src/models/Setting.js`

### 3. Rename `OrganizationMembership.js` → `OrganisationMembership.js`
- Update model name to `OrganisationMembership`
- Change `collection: 'organization_memberships'` → `'organisation_memberships'`
- Rename `tenant_id` → `organisation_id`
- Change `ref: 'Tenant'` → `ref: 'Organisation'`

### 4. Update all controller imports and variables
In `src/controllers/authController.js`, `src/controllers/saasController.js`, `src/controllers/settingsController.js`, `src/controllers/authorizationController.js`, and all others:
- `import Tenant from '...'` → `import Organisation from '...'`
- All local vars: `tenant` → `organisation`, `tenantId` → `organisationId`
- JWT payload field: `tenant_id` → `organisation_id`

### 5. Update `src/middleware/auth.js`
- `requireTenantAuth` → `requireOrganisationAuth`
- `req.tenant` → `req.organisation`
- All `tenant_id` lookups → `organisation_id`

---

## Phase 2 — Remove Stale SaaS Registration & Login

### 6. Remove stale endpoints
From `src/controllers/saasController.js` — remove:
- `registerTenant`
- `tenantLogin`

From `src/routes/saas.js` — remove:
- `POST /saas/register`
- `POST /saas/login`

Rename remaining handlers and route paths:
- `listTenants` → `listOrganisations`
- `GET /saas/admin/tenants` → `GET /saas/admin/organisations`
- All other `/tenant` references → `/organisation`

---

## Phase 3 — Auto-seed Admin on Empty DB

### 7. Create `src/utils/seedAdmin.js`
- Load `.env` via `dotenv` at top of file
- Read `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` from `process.env`
- **Hard-fail** (`throw` + `process.exit(1)`) with a descriptive message if any of the three are missing
- Check `Staff.countDocuments({ role: 'admin' })` — if zero:
  - Create admin `Staff` record with `mustChangePassword: true`
  - Send a welcome email via `.env` SMTP config
- On subsequent restarts: exit early silently (admin already exists in DB)

### 8. Add `mustChangePassword` to `src/models/Staff.js`
```js
mustChangePassword: { type: Boolean, default: false }
```
- Include this flag in the JWT payload and login API response in `src/controllers/authController.js`

### 9. Wire up auto-seed in `src/server.js`
- Call `autoSeedAdmin()` after `connectDB()` resolves, before `.listen()`

### 10. Frontend: Forced password-change UX (`client/src/App.tsx`)
- After login, if `mustChangePassword === true`, redirect to `/change-password` route
- Show a **persistent warning banner** until the password is changed
- Include a **"Send reset link via email"** option on the change-password screen
- On successful `PUT /api/staff/me/password`: clear `mustChangePassword` flag in DB, dismiss the banner

---

## Phase 4 — Per-Organisation Settings + Encrypted Email Config

### 11. Refactor `src/models/Setting.js`
- Add `organisation_id: { type: ObjectId, ref: 'Organisation', required: true, unique: true }` — makes `Settings` per-organisation (find-or-create per org instead of singleton)
- Add `emailConfig` sub-document:
```js
emailConfig: {
  host:              { type: String, default: null },
  port:              { type: Number, default: 587 },
  secure:            { type: Boolean, default: false },
  user:              { type: String, default: null },
  encryptedPassword: { type: String, default: null },  // AES-256-GCM encrypted
  fromName:          { type: String, default: null },
  fromAddress:       { type: String, default: null },
  enabled:           { type: Boolean, default: false },
}
```

### 12. Create `src/utils/encryption.js`
- `encrypt(plaintext)` / `decrypt(ciphertext)` using Node built-in `crypto` module
- Algorithm: **AES-256-GCM**
- Key source: `process.env.ENCRYPTION_KEY` (must be exactly **32 characters**)
- Used exclusively for storing/reading SMTP passwords in the DB

> ⚠️ The current `ENCRYPTION_KEY` in `.env` is 20 characters — update it to exactly 32 characters before wiring up encryption.

### 13. Update `src/controllers/settingsController.js`
- Scope all `Settings` queries by `req.user.organisation_id` using **find-or-create** pattern
- On `updateSettings`:
  - If `emailConfig.password` is provided in the request body, encrypt it before saving as `encryptedPassword`
  - Never store the raw password
- On `getSettings`:
  - Return `"••••••••"` as a placeholder for the password field — never return the real value to the client
- Add `testEmailConfig` handler:
  - Build a transporter from the org's saved config (decrypt password)
  - Send a test email to `req.user.email`
  - Return success/failure with SMTP error detail

### 14. Tighten route guards in `src/routes/settings.js`
- Add `requireRole(['owner', 'admin'])` middleware to `PUT /api/settings`
- Add new route: `POST /api/settings/email/test → requireAuth → requireRole(['owner', 'admin']) → testEmailConfig`

### 15. Refactor `src/services/emailService.js`
- Replace the **module-load-time transporter** with a `getTransporter(orgEmailConfig?)` factory function
- All existing send functions (`sendInviteEmail`, `sendVerificationEmail`, etc.) gain an optional `orgEmailConfig` parameter
- Logic:
  - If `orgEmailConfig` is provided **and** `orgEmailConfig.enabled === true` → decrypt password → build transporter from org config
  - Otherwise → fall back to `process.env` SMTP vars (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_EMAIL`)

### 16. Add `Email Configuration` tab to `client/src/pages/Settings.jsx`
Follow the existing 4-tab pattern in the file. New tab:

| Field | Type | Notes |
|---|---|---|
| Enable email config | Toggle | If off, org falls back to system default |
| SMTP Host | Text input | e.g. `smtp.example.com` |
| Port | Number input | Default `587` |
| Secure (TLS) | Toggle | `true` for port 465 |
| Username | Text input | SMTP auth user |
| Password | Password input | **Write-only** — never pre-filled from server |
| From Name | Text input | e.g. `Acme Accounting` |
| From Address | Email input | e.g. `no-reply@acme.com` |

- **Save** button → `PUT /api/settings` with `emailConfig` payload
- **Send Test Email** button → `POST /api/settings/email/test`
- Show success/error toast after both actions
- If password field is left blank on save, do **not** overwrite the stored password

---

## Summary of new files

| File | Purpose |
|---|---|
| `src/models/Organisation.js` | Replaces `Tenant.js` |
| `src/models/OrganisationMembership.js` | Replaces `OrganizationMembership.js` |
| `src/utils/seedAdmin.js` | Auto-seeds admin on empty DB |
| `src/utils/encryption.js` | AES-256-GCM encrypt/decrypt for SMTP passwords |

## Summary of modified files

| File | Change |
|---|---|
| `src/server.js` | Call `autoSeedAdmin()` on startup |
| `src/middleware/auth.js` | Rename tenant → organisation, add `requireRole` helper |
| `src/models/Staff.js` | Add `mustChangePassword` field |
| `src/models/Setting.js` | Add `organisation_id`, add `emailConfig` sub-doc |
| `src/controllers/authController.js` | Include `mustChangePassword` in JWT + response |
| `src/controllers/saasController.js` | Remove stale register/login, rename tenant → organisation |
| `src/controllers/settingsController.js` | Scope by `organisation_id`, add `testEmailConfig` |
| `src/routes/saas.js` | Remove stale routes, rename paths |
| `src/routes/settings.js` | Add role guard, add test email route |
| `src/services/emailService.js` | `getTransporter()` factory, org config support |
| `client/src/App.tsx` | Forced password-change redirect + banner |
| `client/src/pages/Settings.jsx` | Add Email Configuration tab |
