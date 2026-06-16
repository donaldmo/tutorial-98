# SaaS Plans — Architecture & Implementation Plan

## 1. Overview

The platform is a **multi-tenant SaaS** application backed by **MongoDB** (via Mongoose). Each organisation is represented by an organisation/tenant document, and the `plan` field governs what features and resource limits that organisation's admin and staff can access.

SaaS plan metadata is now defined in `src/utils/saasPlans.json`, read through a shared file loader, synced into the `saas_plans` collection, and exposed through both:

- `GET /api/saas-plans` as the primary endpoint
- `GET /api/saas/plans` as a backward-compatible alias

---

## 2. Current Data Model

### `Tenant` (collection: `tenants`)

The canonical home of an organisation's plan state:

| Field | Type | Description |
|---|---|---|
| `_id` | ObjectId | Unique tenant identifier |
| `firm_name` | String | Organisation display name |
| `subdomain` | String | Unique URL-safe slug |
| `email` | String | Owner's email (unique) |
| `plan` | String (enum) | Active plan: `free` · `starter` · `professional` · `enterprise` |
| `subscription_status` | String (enum) | `trial` · `active` · `past_due` · `cancelled` · `expired` |
| `trial_ends_at` | Date | When the free trial expires |
| `subscription_ends_at` | Date | When the current paid billing period ends |
| `payfast_token` | String | PayFast recurring billing token |
| `status` | String (enum) | `pending` · `active` · `suspended` · `cancelled` |
| `owner_name` | String | Owner's display name |
| `owner_email` | String | Owner's email (denormalised) |
| `owner_staff_id` | ObjectId → Staff | FK to the Staff record that is the owner/admin |
| `owner_password_hash` | String | Hashed password (used for tenant-scoped login) |

> **Note:** `owner_staff_id` links the Tenant to its admin `Staff` record. The admin also appears in `OrganizationMembership` with `role: "owner"`.

### `Staff` (collection: `staff`)

Every user — including the firm owner — is a `Staff` document scoped to a tenant via:

| Field | Type | Description |
|---|---|---|
| `tenant_id` | String | The owning tenant's `_id` as string |
| `access_level` | String | `Standard` · `Full` · `Admin` |
| `role` | String | `Admin`, `Partner`, `Manager`, `Accountant`, etc. |

### `OrganizationMembership` (collection: `organization_memberships`)

Join table between `Tenant` and `Staff`:

| Field | Type | Description |
|---|---|---|
| `tenant_id` | ObjectId | Owning tenant |
| `staff_id` | ObjectId | Member staff record |
| `role` | String | `owner` · `admin` · `member` |
| `status` | String | `active` · `revoked` |

The firm owner always has `role: "owner"` and `status: "active"` here.

### `Payment` (collection: `payments`)

Records billing events:

| Field | Type | Description |
|---|---|---|
| `tenant_id` | ObjectId | Paying tenant |
| `plan` | String | Plan being paid for |
| `billing_cycle` | String | `monthly` · `annual` |
| `amount` / `amount_net` | Number | ZAR amounts |
| `status` | String | `pending` · `completed` · `failed` · `refunded` |
| `payfast_payment_id` | String | Gateway reference |

---

## 3. Plan Definitions (JSON-backed)

Plans are defined in `src/utils/saasPlans.json`. Each plan exposes:

| Key | Description | Default |
|---|---|---|
| `max_users` | Max `Staff` records in this tenant (`-1` = unlimited) | varies |
| `max_admins_per_organisation` | Max admin seats per organisation (`-1` = unlimited) | varies |
| `max_organisations_per_owner_email` | Max organisations the same owner/admin email can actively belong to (`-1` = unlimited) | varies |
| `max_clients` | Max `Client` records | varies |
| `max_jobs` | Max `Job` records | varies |
| `price_monthly` | ZAR monthly price | varies |
| `price_annual` | ZAR annual price (10 months for 12) | varies |

### Current canonical values

| Plan | Users | Admins | Organisations | Clients | Jobs | Monthly (ZAR) | Annual (ZAR) |
|---|---|---|---|---|---|---|---|
| `free` | 3 | 1 | 1 | 20 | 50 | R0 | R0 |
| `starter` | 10 | 2 | 2 | 100 | 200 | R499 | R4,990 |
| `professional` | 30 | 5 | 3 | 500 | 1,000 | R999 | R9,990 |
| `enterprise` | ∞ | ∞ | ∞ | ∞ | ∞ | R2,499 | R24,990 |

### Screenshot vs previous backend vs final JSON

| Plan | Screenshot visible | Previous backend API | Final JSON-backed API | Migration note |
|---|---|---|---|---|
| `free` | `Free`, `Up to 3 staff`, 4 features | `Free`, `max_users = 5`, no `features`, no `recommended` | `Free`, `max_users = 3`, full `features`, `recommended = false` | Screenshot staff limit now wins |
| `starter` | `R499/mo`, `Up to 10 staff`, 4 features | `R499/mo`, `max_users = 15`, no `features`, no `recommended` | `R499/mo`, `max_users = 10`, full `features`, `recommended = false` | Screenshot staff limit now wins |
| `professional` | `R999/mo`, `Up to 30 staff`, `Most popular`, 6 features | `R999/mo`, `max_users = 50`, no `features`, no `recommended` | `R999/mo`, `max_users = 30`, full `features`, `recommended = true` | Screenshot staff limit and badge now win |
| `enterprise` | `R2,499/mo`, `Unlimited staff`, 4 features | `R2,499/mo`, unlimited `max_users`, no `features`, no `recommended` | `R2,499/mo`, unlimited `max_users`, full `features`, `recommended = false` | Screenshot fills display metadata |

### Fields retained from the old backend

These fields are not visible in the screenshot, but remain in the canonical JSON because the app still uses them operationally:

- `max_clients`
- `max_jobs`
- `max_admins_per_organisation`
- `max_organisations_per_owner_email`
- `price_annual`

### Manual configuration notes

- No screenshot-visible plan had to be skipped during migration.
- Annual pricing and non-visual enforcement fields were retained from the backend because the screenshot does not provide those values.
- Feature-level entitlement gating is still not implemented; the current migration only makes feature lists available in the API and UI.

---

## 4. Registration & Plan Assignment Flow

```
User visits /auth/plans
        │
        ▼
Selects a plan card → navigates to /auth/register?plan=<id>
        │
        ▼
Submits registration form
        │
        ▼
POST /saas/register
  ├─ Validates plan exists in PLAN_LIMITS
  ├─ Creates Tenant { plan, subscription_status: 'trial', status: isFree ? 'active' : 'pending' }
  ├─ Creates Staff (owner) { tenant_id, access_level: 'Admin', is_active: false }
  ├─ Creates OrganizationMembership { role: 'owner', status: 'active' }
  └─ Issues email verification token
        │
        ▼
User verifies email → Staff.is_active = true
        │
        ▼
User signs in at /auth/login
```

---

## 5. Plan Upgrade / Subscription Flow

```
Tenant calls POST /saas/subscribe { plan, billing_cycle }
        │
        ├─ plan === 'free'
        │     └─ Tenant.plan = 'free', subscription_status = 'active'  (immediate)
        │
        └─ paid plan
              ├─ Creates Payment { status: 'pending', amount, plan, billing_cycle }
              └─ Returns PayFast redirect URL
                      │
                      ▼
              User completes PayFast payment
                      │
                      ▼
              POST /saas/payfast-itn (webhook)
                ├─ Verifies signature
                ├─ Payment.status = 'completed'
                ├─ Tenant.plan = <plan>
                ├─ Tenant.subscription_status = 'active'
                ├─ Tenant.subscription_ends_at = now + 30 or 365 days
                └─ Tenant.payfast_token = token (for recurring)
```

---

## 6. Plan Enforcement (Current & Planned)

### Currently enforced
- `PLAN_LIMITS[plan]` lookup on `/saas/register` — rejects unknown plan IDs.
- `tenant.status` check on login — suspended/cancelled tenants cannot sign in.
- Staff creation is capped by `max_users`.
- Client creation is capped by `max_clients`.
- Job creation is capped by `max_jobs`.
- Organisation admin invites/acceptance are capped by `max_admins_per_organisation`.
- Organisation creation is capped by `max_organisations_per_owner_email`.

### Needs implementation
Feature-level entitlement gating is still not implemented. The current enforcement is quota-based only.

---

## 7. Plan Visibility in the Admin UI

### What the org admin should see

The current plan, subscription status, and upgrade CTA should appear in the **Settings** page (`/app/settings`) for any user with `access_level === 'Admin'`.

Suggested UI section: **"Subscription & Plan"**

- Current plan badge + feature summary
- Trial / expiry countdown if applicable
- "Upgrade Plan" button → `/auth/plans?callbackUrl=/app/settings`
- Billing history (list of completed `Payment` records)

### What the `/auth/plans` page needs

The register/plan selection UI now fetches `/api/saas-plans`, with `/api/saas/plans` retained as a compatibility fallback. The `callbackUrl` query param flow:

```
/auth/plans?callbackUrl=/app/settings
        │
        ▼ user selects plan
/auth/register?plan=<id>&callbackUrl=/app/settings
        │
        ▼ (already authenticated upgrade path — TODO)
POST /saas/subscribe { plan }
        │
        ▼ redirect to callbackUrl
/app/settings
```

> **TODO:** When the user is already authenticated (upgrade, not registration), `PlansPage` should call `/saas/subscribe` directly rather than redirecting to `RegisterPage`.

### Shared UI contract

Both plan-facing admin and public views now read the same canonical plan metadata from `src/utils/saasPlans.json`:

- `/auth/register`
  - uses plan name, monthly price, `recommended`, and `features`
  - derives the staff summary from `max_users`
  - does not keep a static frontend copy of the plan catalog
- `/app/settings?tab=subscription`
  - uses the same plan name, monthly price, `recommended`, and `features`
  - also shows admin-only operational data from the same plan objects:
    - `max_users`
    - `max_admins_per_organisation`
    - `max_organisations_per_owner_email`
    - `max_clients`
    - `max_jobs`
    - `price_annual`
  - receives `current_plan` and `available_plans` from `GET /api/settings/subscription`

This keeps the product-facing plan cards and the admin-facing subscription view aligned to a single source of truth while still allowing the admin screen to show richer quota and billing context.

---

## 8. Tenant ↔ Admin Staff Relationship

```
Tenant
  ├─ _id                  ← referenced by all scoped documents
  ├─ plan                 ← governs limits for the whole org
  ├─ owner_staff_id ──────┐
  │                       │
  └─ (many) Staff ────────┘
       └─ OrganizationMembership { role: 'owner' }
```

- Every `Staff` record has a `tenant_id` field (string, denormalised) for direct scoping.
- The owner admin is identified by `OrganizationMembership.role === 'owner'` **and** by `Tenant.owner_staff_id`.
- Downstream models (`Job`, `Client`, `Allocation`, `TimeEntry`, etc.) are all scoped to a `tenant_id`.

---

## 9. Proposed `Plan` Document (Optional Future Enhancement)

If plans need to become tenant-configurable or trackable in the database (e.g., for custom enterprise pricing), a `Plan` collection can be introduced:

```js
// src/models/Plan.js (proposed)
{
  _id: ObjectId,
  key: String,              // 'free' | 'starter' | 'professional' | 'enterprise' | 'custom'
  name: String,
  description: String,
  price_monthly: Number,    // ZAR
  price_annual: Number,     // ZAR
  max_users: Number,        // -1 = unlimited
  max_clients: Number,
  max_jobs: Number,
  features: [String],       // display-only feature list
  is_public: Boolean,       // show on /auth/plans
  is_active: Boolean,
  created_at: Date,
  updated_at: Date,
}
```

**Migration path:**
1. Seed the `plans` collection from `src/utils/saasPlans.json`.
2. Update `GET /saas/plans` to query `Plan.find({ is_public: true, is_active: true })`.
3. Update `registerTenant` and `createSubscription` to validate `plan` against the `plans` collection.
4. Update `Tenant.plan` enum to allow `'custom'`.

Until then, the JSON file is the source of truth.

---

## 10. SaaS Plan Source Reference

```text
Primary source: src/utils/saasPlans.json
Primary API:    GET /api/saas-plans
Compat alias:   GET /api/saas/plans
Trial config:   SAAS_TRIAL_DAYS remains in .env
```
