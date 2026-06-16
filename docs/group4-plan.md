# Group 4: Performance & Reliability – Implementation Plan

**Date:** 31 March 2026
**Target codebase:** `node-server/` (Express + Mongoose)
**Reference codebase:** `backend/` (FastAPI + Motor – patterns observed and adapted)

---

## 1. Codebase Verification Summary

### 1.1 Node-server (Express – PRIMARY target)

#### Models & Indexes Audit

| Model | Existing Indexes | Gaps Identified |
|---|---|---|
| `Staff.js` | `email` (unique, field-level) | `{ is_active, is_archived }`, `{ role }`, `{ department_id }` |
| `Job.js` | `client_id`, `job_type_id` (field-level); `{status,deadline}`, `{financial_year,job_type}`, `{client_id,status}`, `{submission_date,status}` | Text index on `name + client_name` — keyword search currently uses raw regex which bypasses all indexes |
| `Allocation.js` | `job_id`, `staff_id` (field-level); `{month,staff_id}`, `{month,job_id}`, `{status,month}` | ✅ Well covered |
| `TimeEntry.js` | `allocation_id`, `staff_id`, `job_id` (field-level); `{allocation_id,date}`, `{staff_id,date}`, `{job_id,date}` | Standalone `{ date: 1 }` for the `loadCommon()` month-prefix regex query (no leading key for date currently) |
| `Client.js` | `name` (unique), `{is_active,name}` | ✅ Well covered |
| `Department.js` | None | `{ is_active: 1 }` (every department query filters by `is_active`) |
| `Notification.js` | `recipient_id`, `is_read` (field-level, separate) | Compound `{ recipient_id: 1, is_read: 1 }` to serve the combined `{ recipient_id, is_read: false }` query pattern |
| `MonthlySnapshot.js` | `month` (unique) | ✅ Well covered |
| `JobType.js` | `name` (unique), `{is_active,is_system,name}` | ✅ Well covered |

#### Pagination Audit

All seven list/query endpoints return unbounded arrays with no cursor or page controls:

| Controller | Handler | Current cap |
|---|---|---|
| `staffController.js` | `listStaff` | No limit (Mongoose `find()` default) |
| `clientsController.js` | `listClients` | No limit |
| `jobsController.js` | `listJobs` | No limit |
| `allocationsController.js` | `listAllocations` | No limit |
| `timeEntriesController.js` | `listTimeEntries` | No limit |
| `departmentsController.js` | `listDepartments` | No limit |
| `notificationsController.js` | `getNotifications` | No limit |

Python reference (`backend/routes/`) uses `to_list(1000)` as a hard cap (not pageable). Node-server must do better.

#### Analytics / Report Query Audit

| Location | Problem | Severity |
|---|---|---|
| `analyticsController.getStaffEfficiency` | Loads **all** `TimeEntry` documents into memory, then JS `.filter()` by allocation IDs | High – scales O(n) with total time entry count |
| `analyticsController.getJobsEfficiency` | Same pattern as above | High |
| `analyticsController.getManagementDashboard` | Loads all current-month allocations + **all** time entries (no month filter on time entries) | High |
| `analyticsController.getWipSummary` | Loads all jobs + all allocations, then nested JS reduce per job | High |
| `reportsController.loadCommon()` | Fetches all 5 collections (jobs, staff, allocations, time entries, departments) on every report request regardless of month | High |
| `reportsController.reportFirmProfitability` | Joins allocations → staff in JS using `staffMap.get()`; no aggregate | Medium |
| `reportsController` various | `loadCommon(month)` passes month but `TimeEntry.find({ date: { $regex: \`^${month}-\` } })` – regex not using any leading index key | Medium |

#### Error Handling / Logging Audit

| Area | Current state | Gap |
|---|---|---|
| `middleware/errorHandler.js` | 11 lines; `console.error(err)` (unstructured); returns `{ detail: message }` only | No structured fields (requestId, method, path); no Mongoose error classification; no stack sanitisation in production |
| `utils/asyncHandler.js` | 2 lines; catches and forwards to `next` only | No enrichment, no context attachment |
| `app.js` | No request logging middleware | No access log (method, path, status, duration) |
| General | No logger utility | `console.log/error` scattered; no log levels; no JSON output for log aggregators |

---

### 1.2 Python backend (FastAPI – REFERENCE)

Observed patterns (for parity / inspiration):

- `server.py` configures `logging.basicConfig` + per-module `logger = logging.getLogger(__name__)` – structured at module level. We replicate this discipline in the Node layer.
- All list endpoints use `to_list(1000)` / `to_list(10000)` – a hard cap, **not** pageable. The Node implementation must introduce true pagination.
- Report routes (`/reports/*`) load entire collections with `to_list(10000)` and aggregate in Python – same in-memory limitation we are fixing in Node.
- No pagination middleware or shared utility in Python backend.
- FastAPI raises `HTTPException(status_code=..., detail=...)` – uniform error shape that Node already mirrors with `{ detail }`. We preserve this contract.
- No custom request logging in the Python routes.

---

## 2. Task Breakdown

### Task 4.1 – DB Indexes for Common Filters

**Objective:** Add missing indexes to the five models with identified gaps so that the most common query predicates hit index-backed paths.

**Files to change:**

| File | Index to add | Reason |
|---|---|---|
| `models/Staff.js` | `{ is_active: 1, is_archived: 1 }` | Reports and analytics filter `{ is_active: true, is_archived: { $ne: true } }` |
| `models/Staff.js` | `{ role: 1 }` | Role-based capacity and report queries |
| `models/Staff.js` | `{ department_id: 1 }` | Department drill-down filters in reports |
| `models/Job.js` | `{ name: 'text', client_name: 'text' }` | Replace regex `$or` search with indexed `$text` query |
| `models/TimeEntry.js` | `{ date: 1 }` | Month-prefix filter in `loadCommon()` needs leading key |
| `models/Department.js` | `{ is_active: 1 }` | All department queries filter by `is_active` |
| `models/Notification.js` | `{ recipient_id: 1, is_read: 1 }` | Combined filter pattern `{ recipient_id, is_read: false }` |

**Also update:** `controllers/jobsController.js` – replace regex-based `$or` keyword search with MongoDB `$text` + `$search` query once the text index is in place.

---

### Task 4.2 – Pagination on List Endpoints

**Objective:** All collection-level list responses must support cursor-free offset pagination with a standard envelope so the frontend can page through large datasets.

**New file:** `src/utils/pagination.js`

```
parsePagination(query)
  → { page: Number, limit: Number, skip: Number }

buildPaginationMeta(total, page, limit)
  → { page, limit, total, total_pages }
```

Defaults: `page = 1`, `limit = 50`, `max limit = 200`.

**Response envelope:**
```json
{
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 243,
    "total_pages": 5
  }
}
```

**Controllers to update:**

| Controller | Handler | Query params added |
|---|---|---|
| `staffController.js` | `listStaff` | `?page=&limit=` |
| `clientsController.js` | `listClients` | `?page=&limit=` |
| `jobsController.js` | `listJobs` | `?page=&limit=` |
| `allocationsController.js` | `listAllocations` | `?page=&limit=` |
| `timeEntriesController.js` | `listTimeEntries` | `?page=&limit=` |
| `departmentsController.js` | `listDepartments` | `?page=&limit=` |
| `notificationsController.js` | `getNotifications` | `?page=&limit=` |

> **Breaking-change note:** Existing consumers that expect a raw array will need to read `response.data` instead of the root response. The frontend (`node-server/client/`) list fetches must be updated accordingly. Python backend list endpoints return raw arrays and are unaffected.

---

### Task 4.3 – Optimize Analytics / Report Query Patterns

**Objective:** Eliminate the in-memory full-collection join pattern. Push aggregation work into MongoDB using `$group`, `$match`, and `$lookup` stages.

#### 4.3.1 – `analyticsController.js` fixes

| Function | Current | Fix |
|---|---|---|
| `getStaffEfficiency` | Loads **all** `TimeEntry` docs, JS `.filter()` | `TimeEntry.aggregate([{ $match: { allocation_id: { $in: allocIds } } }, { $group: { _id: '$allocation_id', total: { $sum: '$hours_worked' } } }])` |
| `getJobsEfficiency` | Same pattern | Same aggregate approach, grouped by `job_id` via allocation lookup |
| `getManagementDashboard` | Loads all allocations + all time entries | `TimeEntry.aggregate` → sum hours for current-month allocation IDs only |
| `getWipSummary` | JS reduce on all jobs × all allocations | `Allocation.aggregate([{ $group: { _id: '$job_id', total_fee: { $sum: '$allocated_fee' }, total_hours: { $sum: '$adjusted_hours' } } }])` then merge into job rows by Map |

#### 4.3.2 – `reportsController.js` fixes

| Function | Current | Fix |
|---|---|---|
| `loadCommon(month)` | `TimeEntry.find({})` when month is null; regex filter when set | Accept `allocIds` from caller; query `TimeEntry.find({ allocation_id: { $in: allocIds } })` |
| `reportFirmProfitability` | JS `staffMap.get()` join in loop | `Allocation.aggregate([{ $lookup: Staff }, { $group: { _id: '$job_id', ... } }])` |
| All callers of `loadCommon` | Pass unused month | Refactored: callers pass `{ jobs, allocations }` then request time entries only for known allocation IDs |

---

### Task 4.4 – Standardize Error Handling & Structured Logging

**Objective:** Replace ad-hoc `console.error` calls with a structured JSON logger, classify all known Mongoose error types in the central error handler, and emit access logs for every request.

#### New files

**`src/utils/logger.js`** – Thin structured logger (no new runtime dependency; JSON serialized to stdout):
```js
// levels: debug | info | warn | error
logger.info({ requestId, method, path }, 'message')
logger.error({ err, requestId }, 'unhandled error')
```

**`src/utils/AppError.js`** – Operational error class:
```js
class AppError extends Error {
  constructor(message, statusCode) { ... }
  // statusCode, isOperational = true
}
```

**`src/middleware/requestLogger.js`** – Per-request access log:
```js
// Attaches req.requestId (uuid v4 or x-request-id header)
// On response finish: logs { ts, level, requestId, method, path, status, duration_ms }
```

#### Updated files

| File | Change |
|---|---|
| `middleware/errorHandler.js` | Classify Mongoose `ValidationError` → 400, `CastError` → 400, duplicate key (code 11000) → 409, JWT errors → 401. Log structured with `logger.error`. Suppress stack trace in production. |
| `utils/asyncHandler.js` | Attach `req.requestId` to caught error for downstream logging context |
| `src/app.js` | Wire `requestLogger` middleware immediately after CORS (before routes) |

#### Structured log format
```json
{
  "ts": "2026-03-31T12:00:00.000Z",
  "level": "info",
  "requestId": "b3d2e1a0-...",
  "method": "GET",
  "path": "/api/jobs",
  "status": 200,
  "duration_ms": 42
}
```

---

## 3. Implementation Order

```
4.4 → 4.1 → 4.3 → 4.2
```

| Step | Reason |
|---|---|
| **4.4 first** | Logger infrastructure must exist before anything else writes structured logs |
| **4.1 second** | Index creation is zero-downtime; makes 4.3 aggregations significantly cheaper |
| **4.3 third** | Aggregation rewrites benefit immediately from the new indexes |
| **4.2 last** | Pagination wraps the now-optimized queries; changing response shape last minimises frontend churn during implementation |

---

## 4. File Change Summary

| File | Task | Type |
|---|---|---|
| `src/utils/logger.js` | 4.4 | **new** |
| `src/utils/AppError.js` | 4.4 | **new** |
| `src/middleware/requestLogger.js` | 4.4 | **new** |
| `src/utils/pagination.js` | 4.2 | **new** |
| `src/middleware/errorHandler.js` | 4.4 | update |
| `src/utils/asyncHandler.js` | 4.4 | update |
| `src/app.js` | 4.4 | update |
| `src/models/Staff.js` | 4.1 | update |
| `src/models/Job.js` | 4.1 | update |
| `src/models/TimeEntry.js` | 4.1 | update |
| `src/models/Department.js` | 4.1 | update |
| `src/models/Notification.js` | 4.1 | update |
| `src/controllers/jobsController.js` | 4.1 + 4.2 | update |
| `src/controllers/staffController.js` | 4.2 | update |
| `src/controllers/clientsController.js` | 4.2 | update |
| `src/controllers/allocationsController.js` | 4.2 | update |
| `src/controllers/timeEntriesController.js` | 4.2 | update |
| `src/controllers/departmentsController.js` | 4.2 | update |
| `src/controllers/notificationsController.js` | 4.2 | update |
| `src/controllers/analyticsController.js` | 4.3 | update |
| `src/controllers/reportsController.js` | 4.3 | update |

**Total: 4 new files, 17 updated files.**
