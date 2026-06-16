# Implementation Phases: Job Type Snapshots & Allocation-Only Components

## Overview

Fix the inconsistency between the job page's "Job Component Split" and the allocation page's "Work Component Coverage" by making each job's embedded `job_type_entries[].work_components[]` the sole source of truth for required coverage. Remove all legacy two-type (`payroll`/`management_accounts`) data paths. Add allocation-only custom components that do not mutate the job or global templates.

**Core rules:**
- Job creation/editing defines the job's required split (embedded snapshot).
- Allocation creation/editing assigns people, fees, and component coverage against that split.
- Allocation-only custom components do not mutate the job or global templates.
- Empty `work_components[]` means no split rules — allocation is free-form.

**No data migration needed** — dev database will be cleaned. No backward-compat fallbacks.

---

## Phase 1 — Schema & Controller Cleanup

Remove legacy dual representation. Clean the Job model and `normalizeJobPayload` so only `job_type_entries[]` is written. Update frontend display sites to read from entries instead of legacy fields.

### Backend

#### `src/models/Job.js` — Remove legacy fields, add missing fields

**Remove:**
- `job_type_id` (single scalar, line 10)
- `job_type` nested object (lines 12-21)
- `job_type_label` (line 23)

**Add `service` to `work_components[]`** (free string, no enum):
```js
work_components: [{
  name: { type: String },
  service: { type: String, default: 'general' },
  role: { type: String, default: null },
  percentage: { type: Number, default: 0 },
  hours_multiplier: { type: Number, default: 1 },
}]
```

**Add `job_type_name` to `job_type_entries[]`:**
```js
job_type_entries: [{
  job_type_id: { type: Schema.Types.ObjectId, ref: 'JobType' },
  job_type_name: { type: String, default: '' },
  fee: { type: Number, min: 0 },
  work_components: [...],
}]
```

#### `src/controllers/jobsController.js` — Clean `normalizeJobPayload`

**Remove:**
- Legacy `job_type.payroll`/`management_accounts` nested branch (lines 103-164)
- `payload.job_type = { payroll: ..., management_accounts: ... }` assignment (lines 82-84)
- `serviceKey` hardcoded mapping (line 89)
- `payload.job_type_label` derivation (lines 94, 118, 150-152)
- `payload.job_type_id` assignment (lines 95, 155)
- `!body.job_type_label` required validation (line 314)

**Keep only** the `job_types[]` array path (lines 60-102), simplified to:
```js
if (Array.isArray(payload.job_types) && payload.job_types.length > 0) {
  const entries = payload.job_types;
  delete payload.job_types;

  const totalFee = entries.reduce((s, e) => s + (toNumOrNull(e.fee) || 0), 0);
  if (payload.job_fee === undefined || payload.job_fee === null) {
    payload.job_fee = totalFee;
  }

  const resolvedTypes = await Promise.all(
    entries.map(async (entry) => {
      const jobTypeId = toObjectId(entry.id, 'job_types[].id');
      const jobType = await JobType.findById(jobTypeId);
      return { jobType, fee: toNumOrNull(entry.fee) || 0 };
    })
  );

  payload.job_type_entries = resolvedTypes
    .filter((r) => r.jobType)
    .map((r, i) => ({
      job_type_id: r.jobType._id,
      job_type_name: r.jobType.name,
      fee: r.fee,
      work_components: entries[i]?.work_components ?? [],
    }));
}
```

### Frontend

#### Remove legacy reads across display components

| File | Action |
|---|---|
| `JobDetailPage.tsx` | Remove `job_type.payroll.amount` / `.management_accounts.amount` reads (lines ~152-153). Derive `job_type_label` as `entries.map(e => e.job_type_name).join(' & ')` |
| `JobDetailsDrawer.tsx` | Derive label from `job_type_entries` instead of reading `job_type_label` (line ~69) |
| `JobsPage.tsx` | Remove `computeRoleAmounts` legacy fallback (lines ~392-434) |
| `JobForm.tsx` | Remove legacy `job_type.payroll`/`management_accounts` fallback reads (lines ~59-72) |
| `workComponentLabels.ts` | Remove hardcoded service mapping (lines ~7-9) — pass unknown services through transparently |
| `StaffDetailPage.tsx` | Remove hardcoded service mapping + sort order (lines ~34-43, ~612) |

#### Submit `service` from JobForm

Update `JobForm.tsx` so each submitted work component includes `service` alongside `name`, `role`, `percentage`, `hours_multiplier`. The service value comes from the job type entry's template or user selection.

### Verification after Phase 1

- Existing jobs wiped from dev DB, so no legacy data issues.
- Create job with 1+ job types via `POST /jobs` → verify `job_type_entries` stored with `job_type_name` and `service` on each component.
- Job detail page renders correct component split with label derived from entries.
- No references to `job_type.payroll`, `job_type.management_accounts`, or `job_type_label` in the database.

---

## Phase 2 — Services Use Embedded Components Only

Strip all legacy fallback paths from services. Make `resolveRequiredRoles` and `calculateAllocationMetrics` read solely from embedded `job_type_entries[].work_components`. Remove `addWorkComponentToJob` and `persist_component`.

### Backend

#### `src/services/workComponentService.js`

**Replace `resolveRequiredRoles`** — remove legacy path, keep only the modern `job_type_entries` loop:
```js
const resolveRequiredRoles = async (job) => {
  const effectiveFee = Number(job.pricing_override ?? job.job_fee) || 0;
  if (!effectiveFee || !job.job_type_entries?.length) return [];

  const serviceContributions = {};

  for (const entry of job.job_type_entries) {
    const entryFee = Number(entry.fee || 0);
    if (entryFee <= 0) continue;
    const components = entry.work_components || [];
    if (!components.length) continue;

    const entryService = normalizeWorkComponentService(entry.job_type_name || '');
    const rawTotal = components.reduce((s, c) => s + Number(c.percentage || 0), 0) || 100;

    for (const comp of components) {
      const svc = normalizeWorkComponentService(comp.service || entryService || 'general');
      const key = normalizeWorkComponentKey(svc, comp.role || comp.name || 'unknown');
      const normalizedPct = (Number(comp.percentage || 0) / rawTotal);
      const feePortion = entryFee * normalizedPct;

      if (!serviceContributions[key]) {
        serviceContributions[key] = { fee: 0, service: svc, role: comp.role || null, name: comp.name || key };
      }
      serviceContributions[key].fee += feePortion;
    }
  }

  return Object.entries(serviceContributions)
    .filter(([, data]) => data.fee > 0)
    .map(([key, data]) => ({
      key, service: data.service, role: data.role, name: data.name,
      requiredPercentage: round((data.fee / effectiveFee) * 100, 2),
    }));
};
```

**Remove `addWorkComponentToJob` function** entirely (lines 301-352).

#### `src/services/planningService.js`

**Add `getEmbeddedComponentForAllocation`** to replace catalog-based lookup:
```js
const getEmbeddedComponentForAllocation = (job, workComponentKey) => {
  if (!job?.job_type_entries?.length || !workComponentKey) return null;

  const normalizedKey = normalizeWorkComponentKey(workComponentKey);

  for (const entry of job.job_type_entries) {
    if (!entry.work_components?.length) continue;
    const entryService = normalizeWorkComponentService(entry.job_type_name || '');

    for (const comp of entry.work_components) {
      const compService = normalizeWorkComponentService(comp.service || entryService || 'general');
      const compKey = normalizeWorkComponentKey(compService, comp.role || comp.name || 'unknown');
      if (compKey === normalizedKey) {
        return { component: comp, entryFee: Number(entry.fee || 0) };
      }
    }
  }
  return null;
};
```

**Update `calculateAllocationMetrics`** to use `getEmbeddedComponentForAllocation` instead of `getJobTypeConfigForAllocation` for the matched component. The matched component's embedded `percentage` and `hours_multiplier` are used directly.

**Remove legacy paths** from `getJobTypeConfigForAllocation` (lines 150-167).

#### `src/controllers/allocationsController.js`

- Remove `addWorkComponentToJob` import (line 19)
- Remove `persistComponent` block (lines 396-406)
- Remove `persist_component` from `createAllocation` payload

### Frontend

#### `AllocateJobPage.tsx`

- Remove `persistComponents` state (line 94)
- Remove `persist_component` from allocation payload (line 333)
- Remove `setPersistComponents(false)` reset (line 345)
- Remove "Persist component" checkbox UI (lines 800-808)

### Verification after Phase 2

- Create job, open allocation page → coverage matches job page component split.
- Allocate against a job-defined component → validation enforces component cap.
- `persist_component` no longer accepted by backend or visible in frontend.
- Components with same role across different services show as separate rows.

---

## Phase 3 — Custom Allocation-Only Components (Backend)

Add fields to Allocation model, handle `custom_component: true` in `createAllocation`, and return custom allocations separately in the coverage endpoint.

### Backend

#### `src/models/Allocation.js` — Add fields

```js
custom_component: { type: Boolean, default: false },
component_label: { type: String, default: null },
component_service: { type: String, default: null },
component_role: { type: String, default: null },
```

#### `src/controllers/allocationsController.js` — Update `createAllocation`

Add a branch at the start of the handler, before the existing job-defined component path:

```js
const { custom_component, component_label, component_service, component_role, allocated_fee } = req.body || {};

if (custom_component) {
  if (!allocated_fee) {
    return res.status(400).json({ detail: 'allocated_fee is required for custom components' });
  }

  const effectiveJobFee = Number(job.pricing_override ?? job.job_fee ?? 0);
  const derivedPercentage = effectiveJobFee > 0
    ? round((Number(allocated_fee) / effectiveJobFee) * 100, 2)
    : 0;

  // Validate total cap only
  const totalValidation = await validateAllocationTotalPercentage({
    jobId: jobObjectId, month: targetMonth, newPercentage: derivedPercentage,
  });
  if (!totalValidation.valid) {
    return res.status(422).json({
      detail: 'Allocation exceeds 100% total allocation limit',
      errors: totalValidation.errors, warnings: totalValidation.warnings,
    });
  }

  const metrics = await calculateAllocationMetrics({
    job, staff, requestedPercentage: derivedPercentage, workComponentKey: null,
  });

  const created = await Allocation.create({
    job_id: jobObjectId, staff_id: staffObjectId,
    percentage: metrics.percentage, allocated_fee: Number(allocated_fee),
    calculated_hours: metrics.calculated_hours, adjusted_hours: metrics.adjusted_hours,
    month: targetMonth,
    custom_component: true,
    component_label: component_label || null,
    component_service: normalizeWorkComponentService(component_service || ''),
    component_role: component_role || null,
    // No work_component_key — custom components don't match job-defined keys
    ...
  });

  // Continue with email, notifications, snapshots...
}
```

The existing job-defined allocation path remains unchanged. Custom allocations do NOT call `validateAllocationMatchesWorkComponents`.

#### `src/services/workComponentService.js` — Update `getAllocationCoverage`

Separate custom allocations from required in the coverage response. After the existing aggregation loop, partition allocations by `custom_component`:

```js
const requiredAllocations = allocations.filter(a => !a.custom_component);
const customAllocations = allocations.filter(a => a.custom_component);

// ... existing logic using requiredAllocations instead of allocations ...

return {
  ...existingReturn,
  customAllocations: customAllocations.map(a => ({
    component_label: a.component_label || a.work_component_key || 'Custom',
    component_service: a.component_service || null,
    component_role: a.component_role || null,
    allocated_fee: Number(a.allocated_fee || 0),
    percentage: Number(a.percentage || 0),
    staff: [a.staff_id?.name || 'Unknown'],
  })),
};
```

### API — Create custom allocation

```js
POST /allocations
{
  job_id: "...",
  staff_id: "...",
  custom_component: true,
  component_label: "Special Review",
  component_service: "payroll",
  component_role: "Reviewer",
  allocated_fee: 500,
  month: "2026-06"
}
```

### API — Allocation coverage response

```js
GET /jobs/:id/allocation-coverage
{
  job_id: "...",
  job_name: "...",
  client_name: "...",
  job_type_label: "Payroll & Audit",
  allocation_status: "partially_allocated",
  job_fee: 10000,
  requiredRoles: [...],       // job-defined only
  allocatedRoles: [...],      // only allocations with matching work_component_key
  missingRoles: [...],
  isComplete: false,
  customAllocations: [{
    component_label: "Special Review",
    component_service: "payroll",
    component_role: "Reviewer",
    allocated_fee: 500,
    percentage: 5.0,
    staff: ["Staff D"],
  }],
}
```

Custom allocations count toward `total_allocated_percentage` and `total_allocated_fee` but NOT toward `missingRoles` or `isComplete`.

### Verification after Phase 3

- Create custom allocation-only → 201 returned, job unchanged.
- Custom allocation contributes to total allocated but not to `fully_allocated` status.
- Coverage endpoint returns `customAllocations` separately.
- Component cap NOT enforced for custom allocations; total cap IS enforced.

---

## Phase 4 — Custom Allocation-Only Components (Frontend)

Add the mode toggle, custom component inputs, and the custom section in the coverage panel.

### `AllocateJobPage.tsx` — Component selection

Replace the single dropdown with a **mode toggle + contextual input**:

```
┌─────────────────────────────────────────────┐
│  Component: [● Job component  ○ Custom]     │
│                                             │
│  When ● Job component:                      │
│  ┌──────────────────────────────────────┐   │
│  │ [payroll:Bookkeeper              ▼]  │   │
│  └──────────────────────────────────────┘   │
│                                             │
│  When ○ Custom:                             │
│  ┌──────────────┐  ┌───────────────┐       │
│  │ Label        │  │ Special Review│        │
│  ├──────────────┤  ├───────────────┤       │
│  │ Service      │  │ [Payroll ▼]   │        │
│  ├──────────────┤  ├───────────────┤       │
│  │ Role         │  │ [Reviewer ▼]  │        │
│  ├──────────────┤  ├───────────────┤       │
│  │ Fee          │  │ [$500      ]  │        │
│  └──────────────┘  └───────────────┘       │
│  → 5.0% of job fee ($500 / $10,000)        │
└─────────────────────────────────────────────┘
```

- Default mode: "Job component"
- Service dropdown in custom mode: populated dynamically from `job.job_type_entries[].job_type_name`
- Role dropdown: populated from `enums.roles`
- Auto-calculated percentage shown as live hint
- Submit sends `custom_component: true` + metadata fields

### `AllocationCoveragePanel.tsx` — Custom section

Add a new section below the required coverage:

```
┌─────────────────────────────────────────────┐
│  Work Component Coverage                    │
│  ┌─ payroll:Bookkeeper  ████████░░ 80% ─┐  │
│  │  Staff A: 50% · Staff B: 30%          │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  ──── Custom Allocations ────               │
│  ┌─ ══ Special Review ══  $500 / 5% ────┐  │
│  │  Payroll · Reviewer                   │  │
│  │  Staff D: 5%                          │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

- Custom section uses dashed border / distinct visual style.
- Shows `allocated_fee` instead of cap-limited percentage.
- Not included in `missingRoles` or `isComplete` display.

### Verification after Phase 4

- Toggle to "Custom" → fee input appears, component dropdown hides.
- Submit custom allocation → appears under "Custom Allocations" section.
- "Persist component" checkbox is gone.
- End-to-end: create job → allocate job-defined → add custom allocation → both visible.

---

## API Contract Reference

### Create/Update Job

```js
POST/PUT /jobs
{
  name: "...",
  client_name: "...",
  client_id: "...",
  job_fee: 10000,
  job_types: [
    {
      id: "objectid",
      fee: 6000,
      work_components: [
        { name: "Bookkeeper", service: "payroll", role: "Bookkeeper", percentage: 40, hours_multiplier: 1 },
        { name: "Reviewer", service: "payroll", role: "Reviewer", percentage: 60, hours_multiplier: 1 },
      ]
    },
    {
      id: "objectid2",
      fee: 4000,
      work_components: []   // empty = no split rules
    }
  ]
}
```

### Create Allocation (job-defined)

```js
POST /allocations
{
  job_id: "...",
  staff_id: "...",
  work_component_key: "payroll:Bookkeeper",
  percentage: 100,    // component-relative
  month: "2026-06"
}
```

### Create Allocation (custom)

```js
POST /allocations
{
  job_id: "...",
  staff_id: "...",
  custom_component: true,
  component_label: "Special Review",
  component_service: "payroll",
  component_role: "Reviewer",
  allocated_fee: 500,
  month: "2026-06"
}
```

---

## Testing Plan

### Phase 1
- Create job with 2+ job types → `job_type_entries` stored with `job_type_name` and `service`.
- Create job with empty `work_components[]` → no required roles in coverage.
- Job detail page renders correct split from entries.

### Phase 2
- Multi-type job coverage returns separate rows (no merging).
- `calculateAllocationMetrics` uses embedded component %, not catalog.
- `persist_component` payload → ignored/no-op or rejected.
- `addWorkComponentToJob` no longer callable.

### Phase 3
- Custom allocation created → 201, job split unchanged.
- Custom allocation NOT in `missingRoles` / `isComplete`.
- Total cap enforced, component cap not enforced.
- Coverage endpoint returns `customAllocations` array.

### Phase 4
- Mode toggle switches between component dropdown and custom form.
- Service dropdown populated from `job_type_entries`.
- Fee input shows live % preview.
- Custom section appears in coverage panel with dashed border.

---

## Acceptance Criteria

- [ ] Jobs store embedded snapshot with `service` and `job_type_name`.
- [ ] Allocation coverage matches job page component split.
- [ ] Empty `work_components[]` = free-form allocation.
- [ ] No component merging across services.
- [ ] Custom allocation-only changes affect only allocation records.
- [ ] No `persist_component` / `addWorkComponentToJob` in allocation flow.
- [ ] No legacy `job_type.payroll`/`management_accounts` persisted.
- [ ] No backward-compat fallbacks (clean dev DB).
