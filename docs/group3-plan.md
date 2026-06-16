# Group 3: Excel/Workflow Parity Features — Implementation Plan

**Date:** 2026-03-23  
**Instruction:** Python (FastAPI) is the primary codebase. Node-server (Express) receives mirrored upgrades after each Python feature is completed.

---

## Codebase Snapshot (verified 2026-03-23)

> **Note:** The real node-server (`node-server/src/`) is a MongoDB/Mongoose + ES-modules Express app,
> significantly more complete than the initial plan assumed.

### What was already in place before Group 3 work

| Feature | Python (FastAPI) | Node (Express/Mongoose) |
|---|---|---|
| `submission_date`, `pricing_override`, `budgeted_wip` on Job | ✅ model + schema | ✅ `Job.js` model |
| Work component rules on job types | ✅ `job_type` field only | ✅ `JobType.work_components` embedded schema + `SYSTEM_JOB_TYPES` in `planningService` |
| Per-client role fee splits | ✅ `fee_arrangement` only (flat) | ✅ `Client.role_fee_splits` embedded schema + `getRoleSplitForRole` in `planningService` |
| Working-days calendar model | ❌ missing | ✅ `WorkingDayCalendar.js` + `calculateCalendarSummary` in `planningService` |
| Monthly snapshot model | ❌ missing | ✅ `MonthlySnapshot.js` + `buildSnapshotPayload` / `upsertMonthlySnapshot` in `planningService` |
| Planning calendar endpoints | ❌ missing | ✅ `GET/PUT /api/planning/calendar` |
| Snapshot endpoints | ❌ missing | ✅ `GET/POST /api/planning/snapshots`, `GET /api/planning/snapshots/:month` |
| Over/under schedule report | ❌ missing | ✅ `GET /api/reports/over-under-schedule` |
| WIP status report | ❌ missing | ✅ `GET /api/reports/wip-status` |
| Allocation metric calculation (split-aware) | ❌ missing | ✅ `calculateAllocationMetrics` applies both role_fee_splits and work_components |

### Genuine gaps found — Group 3 work targets these

| Gap | Task |
|---|---|
| `GET /jobs` had zero filtering (status, job_type, dates, search) | 3.4 |
| No dedicated `/analytics/wip-summary` with `budget_wip` + `over_under` | 3.4 |
| No `/analytics/capacity` (calendar-aware team capacity) | 3.3 |
| No dedicated `/work-components` query/preview API | 3.1 |
| No dedicated `/clients/:id/fee-config` endpoints | 3.2 |
| No `workComponentService`, `feeConfigService`, `capacityService` service layer | all |

---

## Implementation Completed (2026-03-23)

### New service files

| File | Purpose |
|---|---|
| `src/services/workComponentService.js` | `getWorkComponents`, `applyWorkComponentSplit`, `getRoleWeightForJobType` |
| `src/services/feeConfigService.js` | `getClientFeeSplitConfig`, `calculateFeeSplit`, `validateFeeSplitPercentages` |
| `src/services/capacityService.js` | `getStaffCapacity`, `getTeamCapacity`, `getCalendarCapacitySummary` |

### New controller + route

| File | Endpoints |
|---|---|
| `src/controllers/workComponentsController.js` | `getWorkComponentRules`, `getRoleWeight`, `previewWorkComponentSplit` |
| `src/routes/workComponents.js` | `GET /work-components`, `GET /work-components/role-weight`, `POST /work-components/preview` |

### Modified files

| File | Change |
|---|---|
| `src/controllers/jobsController.js` | `listJobs` now accepts `status`, `job_type`, `client_id`, `financial_year`, `has_pricing_override`, `submission_date_from`, `submission_date_to`, `deadline_from`, `deadline_to`, `search` query params |
| `src/controllers/analyticsController.js` | Added `getWipSummary` (Task 3.4) and `getCapacitySummary` (Task 3.3) |
| `src/routes/analytics.js` | Registered `GET /analytics/wip-summary` and `GET /analytics/capacity` |
| `src/controllers/clientsController.js` | Added `getClientFeeConfig`, `updateClientFeeConfig`, `previewClientFeeSplit` |
| `src/routes/clients.js` | Registered `GET/PUT /clients/:id/fee-config` and `POST /clients/:id/fee-config/preview` |
| `src/routes/index.js` | Registered `/work-components` router |

---

## Full API Surface Added by Group 3

### Task 3.1 — Work Component Split Rules
```
GET  /api/work-components?job_type=Audit
     → Returns work_components array + total_percentage for the job type

GET  /api/work-components/role-weight?job_type=Audit&role=Partner
     → Returns effective percentage + hours_multiplier for a role in a job type

POST /api/work-components/preview
     Body: { job_type, job_fee, total_hours }
     → Returns fee + hours breakdown per component
```

### Task 3.2 — Per-Client Role-Based Fee Split
```
GET  /api/clients/:id/fee-config
     → Returns role_fee_splits array, total_percentage, validation status

PUT  /api/clients/:id/fee-config
     Body: { role_fee_splits: [{ role, percentage, hourly_rate_override? }] }
     → Replaces split config, validates % sum to 100 ±0.5

POST /api/clients/:id/fee-config/preview
     Body: { total_fee }
     → Returns calculated fee_amount per role without saving
```

### Task 3.3 — Working-Days Calendar and Capacity
```
GET  /api/planning/calendar?month=2026-03
PUT  /api/planning/calendar
     Body: { month, daily_capacity_hours, holidays: [{date, label}], extra_working_days }

GET  /api/analytics/capacity?month=2026-03
     → Returns calendar summary + per-staff effective_capacity_hours
```

### Task 3.4 — Submission Date, Pricing Override, Budgeted WIP
```
GET  /api/jobs?status=&job_type=&submission_date_from=&submission_date_to=
              &has_pricing_override=true&financial_year=&search=&client_id=
              &deadline_from=&deadline_to=

GET  /api/analytics/wip-summary?month=2026-03
     → Returns per-job: budgeted_wip, pricing_override, effective_fee,
       allocated_fee, over_under, over_under_status
       + summary totals
```

### Task 3.5 — Monthly Snapshot and Over/Under Reporting
```
POST /api/planning/snapshots        Body: { month }  → generate/upsert snapshot
GET  /api/planning/snapshots        → list all snapshots
GET  /api/planning/snapshots/:month → get snapshot for specific month
GET  /api/reports/over-under-schedule?month=
GET  /api/reports/monthly-snapshot-history?month=
GET  /api/reports/wip-status?month=
```

---

## Key Design Decisions

| Decision | Choice | Reason |
|---|---|---|
| Snapshot trigger | Manual `POST /planning/snapshots` | Avoids scheduler dependency; cron-callable externally |
| Over/Under formula | `allocated_fee − budget_wip` | Compares what's been allocated vs what was budgeted |
| Working days storage | `WorkingDayCalendar` collection (month-keyed) | Admin-editable per month; accounts for regional holidays |
| Fee split storage | Embedded `role_fee_splits` on Client document | Single document read; no join needed in hot allocation path |
| Work component rules | Embedded `work_components` on `JobType` document + `SYSTEM_JOB_TYPES` static preset | Custom types stored in DB, system types are code constants |
| Fee split validation | `±0.5 %` tolerance on `PUT /fee-config` | Handles floating-point accumulation from UI sliders |
| Job list filtering | MongoDB query built from validated query params | Allows frontend to combine any filters |


**Date:** 2026-03-23  
**Instruction:** Python (FastAPI) is the primary codebase. Node-server (Express) receives mirrored upgrades after each Python feature is completed.

---

## Codebase Snapshot Summary

### Python Backend (FastAPI) — Primary
| File | Status |
|---|---|
| `backend/models/job.py` | Has `budget_wip`, `submission_date`, `pricing_override` fields already on model |
| `backend/models/allocation.py` | Basic: `job_id`, `staff_id`, `hours`, `week_start`, `notes` — **missing** work component split, snapshot fields |
| `backend/models/client.py` | Has `fee_arrangement`, `billing_rate` — **missing** per-role fee split config |
| `backend/models/staff.py` | Has `role`, `charge_out_rate` — **missing** capacity/working-days fields |
| `backend/schemas/job.py` | Mirrors model — includes `budget_wip`, `submission_date`, `pricing_override` ✅ |
| `backend/schemas/allocation.py` | Basic only — needs work component fields |
| `backend/routes/jobs.py` | CRUD only — no split rules, no snapshot logic |
| `backend/routes/allocations.py` | CRUD only — no component split logic |
| `backend/routes/analytics.py` | `utilization` + `wip-summary` — **missing** monthly snapshot, over/under reporting |
| `backend/services/staff_service.py` | Only service layer file so far |
| `backend/alembic/versions/` | `001_initial_schema.py`, `002_bcrypt_migration.py` — needs Group 3 migration |

### Node Server (Express) — Secondary (mirror Python features)
| File | Status |
|---|---|
| `node-server/models/Job.js` | Has `budget_wip`, `submission_date`, `pricing_override` — matches Python model |
| `node-server/models/Allocation.js` | Basic only — needs work component fields |
| `node-server/models/Client.js` | Has `fee_arrangement`, `billing_rate` — needs role-split config |
| `node-server/models/Staff.js` | Has `role`, `charge_out_rate` — needs capacity fields |
| `node-server/routes/jobs.js` | CRUD only |
| `node-server/routes/allocations.js` | CRUD only |
| `node-server/routes/analytics.js` | `utilization` + `wip-summary` — needs snapshot/over-under |

---

## Group 3 Tasks Breakdown

### Task 3.1 — Job-Type Work Component Split Rules
**What:** Define how a job's hours/budget are split by work component (e.g., Fieldwork, Review, Reporting) per job type (e.g., Audit, Tax, Advisory).

**Gap found:**
- No `WorkComponent` model exists in either codebase.
- No split-rule config table exists.
- `Allocation` has no `work_component` field.

**Plan:**
1. **Python** — Create new model `backend/models/work_component_rule.py`
   - Fields: `id`, `job_type`, `component_name`, `split_percentage`, `is_active`
2. **Python** — Add `work_component` field to `Allocation` model + schema
3. **Python** — Create `backend/services/work_component_service.py`
   - `get_rules_by_job_type(job_type)` → returns split rules
   - `apply_split(job, hours)` → returns component-split breakdown
4. **Python** — Add CRUD endpoints to `backend/routes/jobs.py` or new `backend/routes/work_components.py`
5. **Node** — Mirror: add `WorkComponentRule` Sequelize model
6. **Node** — Mirror: add `work_component` field to `Allocation.js`
7. **Node** — Mirror: add routes to `node-server/routes/work_components.js`
8. **Alembic** — Migration `003_work_component_split.py`

---

### Task 3.2 — Per-Client Role-Based Fee Split Configuration
**What:** Each client can define a custom fee split per staff role (e.g., Partner 30%, Manager 40%, Senior 30%). Used for WIP and billing calculations.

**Gap found:**
- `Client` model has `fee_arrangement` and `billing_rate` (flat) — no per-role config.
- No `ClientRoleFeeConfig` model exists in either codebase.

**Plan:**
1. **Python** — Create `backend/models/client_role_fee_config.py`
   - Fields: `id`, `client_id` (FK→clients), `role`, `fee_percentage`, `is_active`
2. **Python** — Create `backend/schemas/client_role_fee_config.py`
3. **Python** — Create `backend/services/fee_config_service.py`
   - `get_fee_config_for_client(client_id)` → role→percentage map
   - `calculate_fee_split(client_id, total_fee)` → role-keyed fee amounts
4. **Python** — Add endpoints under `/clients/{client_id}/fee-config`
5. **Node** — Mirror: `ClientRoleFeeConfig` Sequelize model
6. **Node** — Mirror: routes under `/clients/:id/fee-config`
7. **Alembic** — Part of migration `003` or new `004_client_role_fee_config.py`

---

### Task 3.3 — Working-Days Calendar and Derived Capacity Logic
**What:** Define public holidays and non-working days per month/year. Derive available capacity (hours) per staff member from working days × daily hours.

**Gap found:**
- `Staff` model has no `daily_hours` or `capacity` fields.
- No `WorkingDaysCalendar` model exists.
- No capacity-derived endpoint exists in analytics.

**Plan:**
1. **Python** — Create `backend/models/working_days_calendar.py`
   - Fields: `id`, `year`, `month`, `working_days`, `public_holidays` (JSON or int count), `notes`
2. **Python** — Add `daily_hours` field to `Staff` model (default 8.0)
3. **Python** — Create `backend/services/capacity_service.py`
   - `get_working_days(year, month)` → working day count
   - `get_staff_capacity(staff_id, year, month)` → `working_days × daily_hours`
   - `get_team_capacity(year, month)` → all active staff capacity map
4. **Python** — Add endpoints:
   - `GET /calendar/working-days?year=&month=`
   - `POST /calendar/working-days` (admin)
   - `GET /analytics/capacity?year=&month=`
5. **Node** — Mirror: `WorkingDaysCalendar` Sequelize model + `daily_hours` on Staff
6. **Node** — Mirror: routes in `node-server/routes/calendar.js` + analytics capacity endpoint
7. **Alembic** — Migration `004_working_days_calendar.py` (or merged into `003`)

---

### Task 3.4 — Submission Date, Pricing Override, and Budgeted WIP Fields
**What:** These fields already exist on the `Job` model and schema in both codebases. Need to verify they are exposed via list/filter endpoints and used in WIP summary analytics.

**Gap found:**
- `Job` model + schema already have `submission_date`, `pricing_override`, `budget_wip` ✅
- `Node` `Job.js` model already has them ✅
- `GET /jobs` filter does **not** expose `submission_date` range filter or `pricing_override` filter
- `GET /analytics/wip-summary` does **not** return `budget_wip` or `pricing_override`

**Plan:**
1. **Python** — Update `backend/routes/jobs.py` list endpoint:
   - Add query params: `submission_date_from`, `submission_date_to`, `has_pricing_override`
2. **Python** — Update `backend/routes/analytics.py` wip-summary:
   - Include `budget_wip`, `pricing_override` in response
   - Add `over_under` computed field: `actual_fees - budget_wip` (or `pricing_override` if set)
3. **Node** — Mirror: update `node-server/routes/jobs.js` with same filters
4. **Node** — Mirror: update `node-server/routes/analytics.js` wip-summary response
5. No migration needed (columns already exist)

---

### Task 3.5 — Monthly Snapshot History and Over/Under Reporting
**What:** Capture a point-in-time snapshot of WIP state per job per month. Allow querying historical over/under WIP variance per job or per client.

**Gap found:**
- No snapshot model or table exists in either codebase.
- Analytics only has live queries (`wip-summary`, `utilization`) — no historical data.

**Plan:**
1. **Python** — Create `backend/models/monthly_wip_snapshot.py`
   - Fields: `id`, `job_id` (FK→jobs), `snapshot_month` (Date, YYYY-MM-01), `budgeted_wip`, `actual_fees_at_snapshot`, `pricing_override_at_snapshot`, `total_hours_at_snapshot`, `over_under`, `created_at`
2. **Python** — Create `backend/schemas/monthly_wip_snapshot.py`
3. **Python** — Create `backend/services/snapshot_service.py`
   - `take_monthly_snapshot(db, year, month)` → queries all active jobs, computes over/under, inserts snapshot rows
   - `get_snapshots(db, job_id, year, month)` → query historical records
4. **Python** — Add endpoints:
   - `POST /analytics/snapshots/take?year=&month=` (admin/trigger)
   - `GET /analytics/snapshots?job_id=&year=&month=`
   - `GET /analytics/over-under?year=&month=` (summary view)
5. **Node** — Mirror: `MonthlyWipSnapshot` Sequelize model
6. **Node** — Mirror: routes in `node-server/routes/analytics.js`
7. **Alembic** — Migration `005_monthly_wip_snapshot.py`

---

## Implementation Order

```
Task 3.4  →  smallest, no new models, confirms existing fields are wired correctly
Task 3.1  →  work component split (new model + service + migration)
Task 3.2  →  client role fee config (new model + service + migration)
Task 3.3  →  working-days calendar + capacity (new model + staff field + service)
Task 3.5  →  monthly snapshot + over/under (depends on 3.4 wip-summary being complete)
```

---

## File Creation Checklist

### Python (FastAPI) — New files
- [ ] `backend/models/work_component_rule.py`
- [ ] `backend/models/client_role_fee_config.py`
- [ ] `backend/models/working_days_calendar.py`
- [ ] `backend/models/monthly_wip_snapshot.py`
- [ ] `backend/schemas/work_component_rule.py`
- [ ] `backend/schemas/client_role_fee_config.py`
- [ ] `backend/schemas/working_days_calendar.py`
- [ ] `backend/schemas/monthly_wip_snapshot.py`
- [ ] `backend/services/work_component_service.py`
- [ ] `backend/services/fee_config_service.py`
- [ ] `backend/services/capacity_service.py`
- [ ] `backend/services/snapshot_service.py`
- [ ] `backend/routes/work_components.py`
- [ ] `backend/routes/calendar.py`
- [ ] `backend/alembic/versions/003_group3_schema.py`

### Python (FastAPI) — Modified files
- [ ] `backend/models/allocation.py` — add `work_component` field
- [ ] `backend/models/staff.py` — add `daily_hours` field
- [ ] `backend/schemas/allocation.py` — add `work_component`
- [ ] `backend/schemas/staff.py` — add `daily_hours`
- [ ] `backend/routes/jobs.py` — add submission/pricing filters
- [ ] `backend/routes/analytics.py` — expand wip-summary + add snapshot/over-under endpoints
- [ ] `backend/main.py` — register new routers

### Node (Express) — New files
- [ ] `node-server/models/WorkComponentRule.js`
- [ ] `node-server/models/ClientRoleFeeConfig.js`
- [ ] `node-server/models/WorkingDaysCalendar.js`
- [ ] `node-server/models/MonthlyWipSnapshot.js`
- [ ] `node-server/routes/work_components.js`
- [ ] `node-server/routes/calendar.js`

### Node (Express) — Modified files
- [ ] `node-server/models/Allocation.js` — add `work_component`
- [ ] `node-server/models/Staff.js` — add `daily_hours`
- [ ] `node-server/routes/jobs.js` — add submission/pricing filters
- [ ] `node-server/routes/analytics.js` — expand wip-summary + snapshot/over-under
- [ ] `node-server/server.js` — register new routes

---

## Key Design Decisions

| Decision | Choice | Reason |
|---|---|---|
| Snapshot trigger | Manual API call (`POST /analytics/snapshots/take`) | Avoids scheduler dependency; can be cron-triggered externally |
| Over/Under formula | `pricing_override ?? budget_wip` vs `actual_fees` | Use `pricing_override` when set, else fall back to `budget_wip` |
| Working days storage | DB table (year+month rows) | Admin-editable per region/year; not hardcoded |
| Fee split storage | Separate `client_role_fee_config` table | One client can have multiple role rows; fully flexible |
| Work component rules | `work_component_rule` table keyed by `job_type` | Admin-configurable; not hardcoded enum |
| Node parity | Port after each Python task completes | One language at a time reduces drift risk |