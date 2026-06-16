# Organisational Authorization Implementation Plan

## Problem Summary

Every core data model is missing `tenant_id`, every controller lists/creates/updates/deletes records with zero tenant scoping, and `req.user.tenant_id` (already on the Staff doc) is never used downstream. Any authenticated staff member from any organisation can currently read and mutate every other organisation's data.

### Current State Audit

| Model | `tenant_id` | `created_by` |
|---|---|---|
| `Staff` | ✅ nullable String (needs type fix) | ❌ missing |
| `Client` | ❌ **missing** | ❌ missing |
| `Job` | ❌ **missing** | ❌ missing |
| `Department` | ❌ **missing** | ❌ missing |
| `JobType` | ❌ **missing** | ❌ missing |
| `Allocation` | ❌ **missing** | ❌ missing |
| `TimeEntry` | ❌ **missing** | ❌ missing |
| `Tenant` | N/A (is the tenant) | N/A |
| `OrganizationMembership` | ✅ required ObjectId, indexed | N/A |

| Controller | List scoped? | Create sets `tenant_id`? | Update/Delete ownership check? |
|---|---|---|---|
| `staffController` | ❌ | ❌ | ❌ |
| `clientsController` | ❌ | ❌ | ❌ |
| `jobsController` | ❌ | ❌ | ❌ |
| `departmentsController` | ❌ | ❌ | ❌ |
| `jobTypesController` | ❌ | ❌ | ❌ |
| `allocationsController` | ❌ | ❌ | ❌ |
| `timeEntriesController` | ❌ | ❌ | ❌ |

---

## Implementation Steps

### Step 1 — Fix `Staff.tenant_id` type

**File:** `src/models/Staff.js`

Change `tenant_id` from a plain `String` to a proper `ObjectId` ref so `.equals()` comparisons work correctly across all controllers.

```js
// Before
tenant_id: { type: String, index: true }

// After
tenant_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true }
```

---

### Step 2 — Add `tenant_id` + `created_by` to all missing models

Apply to: `Client.js`, `Job.js`, `Department.js`, `JobType.js`, `Allocation.js`, `TimeEntry.js`

Add the following fields to each schema:

```js
tenant_id: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'Tenant',
  required: true,
  index: true,
},
created_by: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'Staff',
  index: true,
},
```

> `required: true` will be enforced going forward. Existing documents without `tenant_id` will be handled by the backfill script (Step 6).

---

### Step 3 — Harden `requireAuth` middleware

**File:** `src/middleware/auth.js`

After loading the Staff document from the DB:
1. If `req.user.tenant_id` is null/undefined, fall back to the `tenant_id` claim embedded in the verified JWT payload.
2. If still null, return `401 { error: 'No organisation context. Please log in again.' }`.

```js
// After: const staff = await Staff.findById(decoded.id)
if (!staff) return res.status(401).json({ error: 'User not found' })

// Resolve tenant_id from staff doc first, JWT claim as fallback
const tenantId = staff.tenant_id || decoded.tenant_id
if (!tenantId) {
  return res.status(401).json({ error: 'No organisation context. Please log in again.' })
}
req.user = staff
req.user.tenant_id = tenantId   // ensure it is always set
```

---

### Step 4 — Scope all `list` / `find` queries to `tenant_id`

In every controller, all `find` / `findOne` / `aggregate` queries must include `{ tenant_id: req.user.tenant_id }` as a filter condition.

#### Pattern

```js
// Before
const items = await Model.find({ is_archived: { $ne: true } })

// After
const items = await Model.find({
  tenant_id: req.user.tenant_id,
  is_archived: { $ne: true },
})
```

#### Files to update

- `src/controllers/staffController.js` — `getStaff`, `getStaffById`, `searchStaff`, all analytics queries
- `src/controllers/clientsController.js` — `getClients`, `getClientById`, `searchClients`
- `src/controllers/jobsController.js` — `getJobs`, `getJobById`, `getJobsByClient`
- `src/controllers/departmentsController.js` — `getDepartments`, `getDepartmentById`
- `src/controllers/jobTypesController.js` — `getJobTypes`, `getJobTypeById`
- `src/controllers/allocationsController.js` — `getAllocations`, `getAllocationById`, all aggregate pipelines
- `src/controllers/timeEntriesController.js` — `getTimeEntries`, `getTimeEntriesByJob`, `getTimeEntriesByStaff`

Also applies to any sub-queries inside `dashboardController.js`, `analyticsController.js`, `reportsController.js`, and `planningController.js`.

---

### Step 5 — Set `tenant_id` + `created_by` on every `create`

In each controller's create handler, inject before save:

```js
// Pattern
const doc = new Model({
  ...req.body,
  tenant_id: req.user.tenant_id,   // always injected server-side, never trusted from body
  created_by: req.user._id,
})
```

> **Never** trust `tenant_id` from `req.body` — always override with `req.user.tenant_id`.

#### Files to update

| Controller | Function |
|---|---|
| `staffController.js` | `createStaff` |
| `clientsController.js` | `createClient` |
| `jobsController.js` | `createJob` |
| `departmentsController.js` | `createDepartment` |
| `jobTypesController.js` | `createJobType` |
| `allocationsController.js` | `createAllocation` |
| `timeEntriesController.js` | `createTimeEntry` |

---

### Step 6 — Ownership guard on all `update` and `delete`

After fetching a record by `_id`, assert it belongs to the requesting organisation before proceeding.

```js
// Pattern for update/delete handlers
const doc = await Model.findById(id)
if (!doc) return res.status(404).json({ error: 'Not found' })
if (!doc.tenant_id.equals(req.user.tenant_id)) {
  return res.status(403).json({ error: 'Access denied' })
}
```

Apply to every `update*` and `delete*` / `archive*` handler in all 7 controllers listed above.

---

### Step 7 — Backfill migration script

**File:** `scripts/backfill-tenant-ids.js`

For single-tenant and early multi-tenant installs where records were created before `tenant_id` was required, assign the missing `tenant_id` from the first active `OrganizationMembership`.

```js
// Pseudocode
const membership = await OrganizationMembership.findOne({ status: 'active' })
if (!membership) { console.error('No active membership found'); process.exit(1) }

const tenantId = membership.tenant_id

for (const Model of [Client, Job, Department, JobType, Allocation, TimeEntry]) {
  const result = await Model.updateMany(
    { tenant_id: { $exists: false } },
    { $set: { tenant_id: tenantId } }
  )
  console.log(`${Model.modelName}: patched ${result.modifiedCount} records`)
}
```

Run with: `node scripts/backfill-tenant-ids.js`

---

### Step 8 — SuperAdmin bypass

Routes protected by `requireSuperAdmin` should **skip** tenant scoping. When a SuperAdmin needs to query a specific tenant's data (e.g. in the SaaS admin panel), they must pass an explicit `?tenantId=<id>` query param which is validated server-side.

```js
// In superAdmin-scoped routes only
const tenantId = req.query.tenantId
if (!tenantId) return res.status(400).json({ error: 'tenantId query param required' })
const items = await Model.find({ tenant_id: tenantId })
```

---

## Further Considerations

### Frontend

No frontend header changes are needed — the JWT already embeds `tenant_id`. After the backend changes land, pages that currently display cross-tenant data will automatically return only the current org's records. A smoke-test pass on the following pages is recommended:

- Staff list & detail
- Client list & detail
- Job list & detail
- Allocations board
- Time entries
- Dashboard charts
- Reports

### Staff `tenant_id` normalisation

After Step 1 changes `Staff.tenant_id` to `ObjectId`, existing String values in the DB must be converted. Add this to the backfill script:

```js
const Staff = require('../src/models/Staff')
const staffWithStringTenant = await Staff.find({ tenant_id: { $type: 'string' } })
for (const s of staffWithStringTenant) {
  s.tenant_id = new mongoose.Types.ObjectId(s.tenant_id)
  await s.save()
}
```

### `dashboardController`, `analyticsController`, `reportsController`, `planningController`

These controllers contain complex aggregation pipelines that query Staff, Job, Client, Allocation, and TimeEntry in parallel. Each pipeline's `$match` stage must gain `{ tenant_id: req.user.tenant_id }`. These are the highest-risk changes — test thoroughly after rollout.

---

## Progress Tracker

| Step | Status |
|---|---|
| 1 — Fix `Staff.tenant_id` type | ✅ Done |
| 2 — Add `tenant_id` + `created_by` to 6 models | ✅ Done |
| 3 — Harden `requireAuth` middleware | ✅ Done |
| 4 — Scope all list queries | ✅ Done |
| 5 — Set `tenant_id` + `created_by` on create | ✅ Done |
| 6 — Ownership guard on update/delete | ✅ Done |
| 7 — Backfill migration script | ✅ Done |
| 8 — SuperAdmin bypass | ⬜ Pending |
