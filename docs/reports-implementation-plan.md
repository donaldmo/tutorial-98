# Reports Page Implementation Plan

Status legend: `pending` → `in-progress` → `done` (mark `done` only after recheck).

## Constraints (Locked)
- Reports-only blast radius: `in-progress`
- Backend changes must be additive/backward-compatible: `in-progress`
- Centralized status/metric normalization across cards/tables/drilldowns/charts: `in-progress`

---

## Chunk A — Foundation

### 1) Utilization & Productivity: `done`
**Planning & tasks**
- Add strict report typings for this payload.
- Move reports API calls to authenticated client.
- Add clear loading/error/empty states (avoid silent null UI).
- Add centralized metric thresholds and status normalization hooks.

### 2) WIP Status: `done`
**Planning & tasks**
- Normalize status labels and badge mapping (`Doing`/`In Progress` compatibility).
- Ensure drilldown/export use same normalized source rows.
- Keep response compatibility with existing fields.

### 3) Firm Profitability: `done`
**Planning & tasks**
- Type `summary`, `by_service_line`, and job rows.
- Prepare chart-ready data transforms with one normalization helper.
- Keep existing numeric keys unchanged.

### Shared foundation tasks (all reports)
- Add Recharts dependency. ✅
- Create `client/src/types/reports.ts`. ✅
- Create `client/src/pages/reports/reportNormalization.ts`. ✅
- Refactor fetch path in `client/src/pages/ReportsPage.tsx` to authenticated API client. ✅

---

## Chunk B — Charts + first completed report slices

### 1) Utilization & Productivity: `done`
**Planning & tasks**
- Add grouped bar chart (utilization vs productivity by staff).
- Add pie chart (allocated vs unallocated hours).
- Keep table and metric cards aligned to same normalized thresholds.

### 2) WIP Status: `done`
**Planning & tasks**
- Recheck status filtering for cards and drilldown consistency.
- Improve empty-state guidance for no active non-completed jobs.

### 3) Firm Profitability: `done`
**Planning & tasks**
- Add pie chart (revenue by service line).
- Add bar chart (revenue vs labor cost vs gross margin).
- Recheck chart totals equal summary totals.

---

## Chunk C — Remaining report renderers

### 4) Revenue per Employee: `in-progress`
**Planning & tasks**
- Add typed renderer/table.
- Normalize department fallback (`Unassigned`) and contribution formatting.

### 5) Actual vs Budgeted: `in-progress`
**Planning & tasks**
- Add typed renderer/table and status normalization (`Over Budget`/`On Track`).
- Add dependency hint: needs allocations + time entries.

### 6) Turnaround Time: `in-progress`
**Planning & tasks**
- Add typed renderer/table and performance badges (`Late`/`On Time`/`No Deadline`).
- Add dependency hint: deadlines improve report quality.

### 7) Team Productivity: `in-progress`
**Planning & tasks**
- Add typed renderer/table with adherence/efficiency formatting.
- Keep monthly query behavior explicit.

### 8) Capacity Planning: `in-progress`
**Planning & tasks**
- Add typed renderer/table with normalized capacity status (`Overloaded`/`Underutilized`/`Optimal`).
- Add utilization indicator consistency.

### 9) Overtime & Burnout: `in-progress`
**Planning & tasks**
- Add typed renderer/table with normalized risk levels (`High`/`Medium`/`Low`).
- Recheck summary counts match row classifications.

### 10) Quality Review: `in-progress`
**Planning & tasks**
- Add typed renderer/table for exceptions.
- Add dependency hint: variance exceptions require budget vs actual deltas.

---

## Chunk D — Backend additive normalization (reports only)

### Reports normalization service: `done`
**Planning & tasks**
- Add `src/services/reportsNormalization.js`.
- Centralize status keys/labels + thresholds.

### reportsController integration: `done`
**Planning & tasks**
- Refactor duplicated status/metric derivations to helper calls.
- Add optional normalized fields (`status_key`, `status_label`, `metric_meta`) without removing current keys.

---

## Chunk E — Recheck before marking done

### Verification checklist: `in-progress`
- Lint/build pass for client and server.
- `/app/reports` loads each report menu item without default fallback.
- Each report has explicit: loading, error, empty, populated states.
- Charts render responsively and totals match summaries.
- CSV/export and drilldown remain functional.
- No edits outside reports scope unless shared blocker is proven.

---

## Progress log
- 2026-04-20: Plan drafted with chunked tasks and per-report tracking. No code changes marked `done` yet.
- 2026-04-20: Implemented foundation in reports UI (typed data flow, authenticated fetch, error states, generic renderer for all report tabs, charts for Utilization + Firm Profitability).
- 2026-04-20: Implemented backend additive normalization metadata via `src/services/reportsNormalization.js` and reports controller integration.
- 2026-04-20: Recheck completed on changed files using diagnostics (`No errors found` for changed report files). Full frontend build still fails due pre-existing errors outside reports scope.
