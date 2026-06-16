# Reports Static UI Reset Plan

## Summary
- Reset the current reports feature so the 10 reports become **doc-driven static UI only**, with no dependency on live report backend data.
- Rebuild the UI from the provided report mockup/spec documents:
  - `docs/reports-plans/utalization-productivity-ui.md`
  - `docs/reports-plans/wip-status-ui.md`
  - `docs/reports-plans/firm-profitability-ui.md`
  - `docs/reports-plans/Reports & Analytics Documentation.MD`
  - `docs/reports-plans/actual-vs-budgeted-ui.md`
  - `docs/reports-plans/Turnaround-Time-ui.md`
  - `docs/reports-plans/team-productivity.md`
  - `docs/reports-plans/Capacity Planning.md`
  - `docs/reports-plans/overtime.md`
  - `docs/reports-plans/Quality Review.md`
- Keep `Revenue per Employee` grounded in **both** the master documentation and the existing dedicated mockup file `docs/reports-plans/revenue-employee-aka-stuff-ui.md`.
- Reset backend usage for reports so `/app/reports` no longer depends on live `/api/reports/*` calculations for these 10 screens.

## Current State Analysis
- Reports currently live on a single route: `client/src/pages/ReportsPage.tsx`, mounted through:
  - `client/src/App.tsx`
  - `client/src/routes/workflowRoutes.ts`
  - `client/src/pages/workflow/WorkflowPageOutlet.tsx`
- The current reports page is a mixed implementation:
  - `utilization-productivity` and `team-productivity` are generated in the client from prefetched workflow data.
  - the other reports call live backend endpoints through `client/src/services/api.ts`.
- The current page is monolithic and contains:
  - report selector sidebar/cards,
  - period filter handling,
  - export handlers,
  - drilldown modal,
  - detail drawer,
  - multiple ad hoc chart/table branches.
- The current frontend report contracts are loosely normalized through:
  - `client/src/pages/reports/reportNormalization.ts`
  - `client/src/types/reports.ts`
- The current backend reports surface is still live under:
  - `src/routes/reports.js`
  - `src/controllers/reportsController.js`
  - `src/services/teamProductivityService.js`
  - `src/services/reportsNormalization.js`
  - `src/services/reportHelpers.js` (shared helpers used by report logic)
- Current reports backend is real-data driven and depends on:
  - `Job`
  - `Staff`
  - `Allocation`
  - `TimeEntry`
  - `Department`
  - `MonthlySnapshot`
- This is incompatible with the requested target state:
  - user wants reports reset,
  - UI should only copy from the provided docs,
  - reports should be static UI only, without real data.
- Doc reality confirmed from repo:
  - all listed report docs exist except `Revenue per Employee` was only listed through the master doc, but the repo also has `docs/reports-plans/revenue-employee-aka-stuff-ui.md`.
  - the current implementation does **not** faithfully match the docs for several reports, especially `Team Productivity`, `Turnaround Time`, `Utilization & Productivity`, and the latter report set that currently falls back to generic rendering.

## Proposed Changes

### 1. Reset reports page to a doc-driven static UI architecture
- Files:
  - `client/src/pages/ReportsPage.tsx`
  - new report-specific UI components under `client/src/components/workflow/` or `client/src/pages/reports/`
- What:
  - Replace the current mixed live-data page with a static presentation layer built directly from the report docs.
- Why:
  - The current page is tightly coupled to live backend data and generic normalization logic, which conflicts with the requested “UI only without real data” reset.
- How:
  - Keep the single `/app/reports` route unless implementation shows a stronger reason to split, because the current app already has one reports entry point and the docs do not define separate routes.
  - Preserve the left-side report chooser / top-level report selection pattern already present in the app, but rebuild each report body from its document instead of from live data.
  - Split the current monolithic `ReportsPage.tsx` into focused static report sections/components, one per report.
  - Use mock/static datasets embedded in frontend code or a frontend-only mock data module, not API responses.

### 2. Create a frontend-only static report data source
- Files:
  - new file such as `client/src/pages/reports/staticReportData.ts` or `client/src/lib/staticReports.ts`
  - `client/src/types/reports.ts`
- What:
  - Replace live report payload assumptions with static, doc-shaped frontend data.
- Why:
  - Static UI needs stable mock data to render the documented cards, tables, labels, and charts consistently.
- How:
  - Build one static dataset per report from the referenced docs.
  - Update or simplify `client/src/types/reports.ts` so types match the static UI structures actually needed by each report.
  - Stop relying on the current loose normalization layer for reports that no longer consume backend payloads.
  - For `Revenue per Employee`, merge:
    - the metric intent from `Reports & Analytics Documentation.MD`
    - the presentation/table shape from `revenue-employee-aka-stuff-ui.md`

### 3. Rebuild each report UI from the specified docs
- Files:
  - `client/src/pages/ReportsPage.tsx`
  - new report components, likely one file per report
- What:
  - Reconstruct all 10 report bodies to match the docs visually and structurally.
- Why:
  - The user explicitly wants the UI copied from the documentation, not the current implementation.
- How:
  - Implement the following report UIs as doc-driven sections:
    - `Utilization & Productivity` from `utalization-productivity-ui.md`
    - `WIP Status` from `wip-status-ui.md`
    - `Firm Profitability` from `firm-profitability-ui.md`
    - `Revenue per Employee` from both the master doc and `revenue-employee-aka-stuff-ui.md`
    - `Actual vs Budgeted` from `actual-vs-budgeted-ui.md`
    - `Turnaround Time` from `Turnaround-Time-ui.md`
    - `Team Productivity` from `team-productivity.md`
    - `Capacity Planning` from `Capacity Planning.md`
    - `Overtime & Burnout` from `overtime.md`
    - `Quality Review` from `Quality Review.md`
  - Where the master doc adds report-wide context or a metric explanation missing in a dedicated UI file, use it to complete labels and section structure, but keep the visible UI anchored to the dedicated mockup where one exists.
  - Remove current chart/tab/detail branches that are not part of the requested doc-driven reset, unless the docs clearly require them.

### 4. Disconnect the reports page from live backend APIs
- Files:
  - `client/src/pages/ReportsPage.tsx`
  - `client/src/pages/reports/reportNormalization.ts`
  - possibly `client/src/hooks/useWorkflowData.ts` only if reports-specific props become unnecessary
- What:
  - Remove live `/reports/*` fetching and client-side pseudo-generation based on workflow state for this feature.
- Why:
  - Static UI only means the page must not derive report content from:
    - report APIs,
    - prefetched live workflow data,
    - current organization data.
- How:
  - Remove `api.get('/reports/...')` usage from the reports page.
  - Remove the current `generateUtilizationProductivityReport()` and `generateTeamProductivityReport()` live/pseudo-live generation path.
  - Retire or dramatically simplify `reportNormalization.ts` if it is no longer needed.
  - Keep the page props surface minimal; if `staff`, `jobs`, `allocations`, and `selectedMonth` are no longer used, stop depending on them.

### 5. Reset the reports backend surface for the new static-only mode
- Files:
  - `src/routes/reports.js`
  - `src/controllers/reportsController.js`
  - `src/services/teamProductivityService.js`
  - `src/services/reportsNormalization.js`
  - related report tests under `tests/test_api/reports/` and `tests/unit/reports/`
- What:
  - Reset backend report handling so it is no longer part of the active reports feature for these 10 screens.
- Why:
  - The user asked to reset backend and UI, and confirmed the target state is static UI only.
- How:
  - Remove the reports page’s dependency on backend first.
  - Then simplify or disable the report routes/controllers so the codebase no longer presents these live calculations as the implementation behind `/app/reports`.
  - Keep the exact backend strategy minimal and explicit:
    - if backend routes are left in place temporarily, mark them as unused/internal during the reset,
    - otherwise remove the route registrations and report-specific dead code that only exists for the current live reports flow.
  - Update tests accordingly so the suite no longer expects live report endpoints to power the UI.

### 6. Clean up report-specific dead paths and mismatched abstractions
- Files:
  - `client/src/pages/reports/reportNormalization.ts`
  - `client/src/types/reports.ts`
  - `tests/test_api/reports/reports-success.sh`
  - `tests/unit/reports/team-productivity.test.mjs`
- What:
  - Remove or simplify helper abstractions that only existed to reconcile inconsistent live payloads.
- Why:
  - Static UI will be easier to maintain if it is not layered on top of normalization intended for backend inconsistencies.
- How:
  - Delete or shrink report normalization helpers that become unused after the reset.
  - Replace weak/obsolete tests with focused frontend-oriented checks only where they still add value.
  - Avoid keeping stale backend smoke tests that no longer reflect the product direction.

## Assumptions & Decisions
- Confirmed decision: the target state is **static UI only**, not live backend reports and not backend mock APIs.
- Confirmed decision: `Revenue per Employee` should combine the master report documentation with `docs/reports-plans/revenue-employee-aka-stuff-ui.md`.
- The existing `/app/reports` route can remain as the user-facing entry point unless implementation uncovers a requirement for per-report routes; no such requirement appears in the current docs.
- The requested reset means the current live-data reports implementation should be treated as disposable for this feature.
- The report docs are the source of truth for visible layout/content, even when they conflict with the current implementation.

## Verification Steps
- Frontend verification:
  - open `/app/reports`
  - confirm all 10 reports render as static UI without loading live report data
  - confirm each report’s cards, tables, sections, and labels visually match its source doc
  - confirm switching between reports no longer depends on backend API responses
- Dependency verification:
  - confirm `ReportsPage` no longer calls `/api/reports/*`
  - confirm report rendering no longer depends on live `staff`, `jobs`, `allocations`, or report normalization for backend payloads
- Backend/codebase verification:
  - confirm obsolete report routes/controllers/tests are removed or clearly disconnected from the active UI
  - confirm no new diagnostics errors exist in touched frontend/backend files
- Regression sanity:
  - confirm `/app/reports` still mounts correctly in routing
  - confirm surrounding workflow shell/header/sidebar integration still works after the reset
