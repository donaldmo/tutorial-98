# 📊 Brendmo Workflow Planner — Code Analysis

> **Date:** 2 March 2026  
> **Scope:** `backend/` (Python/FastAPI) and `frontend/` (React/CRA) — excludes `node-server/`  
> **Reference:** `exel-overview.md` (Excel Workflow Plan for 2026)

---

## Table of Contents

1. [Initial State of the Application](#1-initial-state-of-the-application)
2. [Principles of Programming](#2-principles-of-programming)
3. [Improvements](#3-improvements)

---

## 1. Initial State of the Application

### 1.1 What the Excel Defines (Source of Truth)

The Excel workbook defines a **fee-based workflow planning system** for an SA accounting firm with:

| Excel Feature | Description |
|---|---|
| **Work Component Split** | Master config: allocation ratios by work type — Management Accounts (10/40/50%), Payroll (10/90%), Once-Off (10/90%) |
| **Client List** | Clients with monthly fees (incl. VAT), totals, and role-based split percentages (Reviewer, Accountant, Bookkeeper) |
| **10 Team Member Schedules** | Individual sheets per staff member with role, senior manager, annual budget |
| **Workflow Dashboards** | Per-staff: annual budget, scheduled fees, hours, over/under analysis |
| **Monthly Sections (Jan–Dec 2026)** | Charge rate (R700/hr), working days, KPI % (0.8), hours/day, budgeted hours |
| **Job Tables** | Monthly Recurring (Mgmt Accounts + Payroll) and Once-Off clients, with entity, notes, estimated fees, completion %, WIP, hours, submission date |
| **Hierarchy** | Clear reporting lines (Star → Mollen, Kenneth → Star, etc.) |

### 1.2 Feature Parity Assessment — What's On Par ✅

| Excel Feature | Code Implementation | Status |
|---|---|---|
| **Staff members with roles** | `StaffMember` model: name, role (9 roles including Partner, Director, Manager, Senior Accountant, Accountant, Junior Accountant, Trainee, Admin, Supervisor), hourly rate, productivity factor | ✅ **On Par** |
| **Hourly charge rate** | `hourly_rate` field on staff, used in allocation fee→hours calculation | ✅ **On Par** |
| **KPI / Productivity factor** | `productivity_factor` (0.1–1.0), default 0.8 — matches Excel's KPI % of 0.8 | ✅ **On Par** |
| **Available hours per month** | `available_hours_per_month` (default 160) | ✅ **On Par** |
| **Annual fee budget** | `annual_fee_budget` on staff model | ✅ **On Par** |
| **Annual budgeted hours** | `annual_budgeted_hours` on staff model | ✅ **On Par** |
| **Job fee-based model** | Jobs priced by `job_fee`, allocations as % of fee, hours derived from `fee ÷ hourly_rate × productivity` | ✅ **On Par** |
| **Monthly allocations** | Allocation model has `month` field (YYYY-MM format), filtered by month | ✅ **On Par** |
| **Job types (Mgmt Accounts, Payroll)** | `JobType` enum includes Management Accounts, Payroll, plus 15 more SA-specific types (SARS, CIPC, B-BBEE, etc.) | ✅ **On Par** |
| **Manager/supervisor hierarchy** | `manager_id`, `supervisor_ids[]`, `get_staff_supervisors()` endpoint | ✅ **On Par** |
| **Client list** | Full `Client` model with CRUD, contact info, industry, import capability | ✅ **On Par** |
| **Budget vs scheduled analysis** | Dashboard endpoints with capacity utilization, allocated vs remaining hours | ✅ **On Par** |
| **Completion % tracking** | `completed_percentage` on allocations, time entry tracking | ✅ **On Par** |
| **ZAR currency** | `Currency.ZAR` default, `R` symbol, South African locale formatting | ✅ **On Par** |

### 1.3 Over-Achieved Features 🚀

The codebase **significantly exceeds** the Excel's scope in the following areas:

| Feature | Description | Excel Equivalent |
|---|---|---|
| **Authentication & Registration** | Full login/register flow with token-based auth, admin approval workflow, email notifications (Resend API) | ❌ Not in Excel |
| **Role-based Access Control** | 4 access levels (Full, Admin, Supervisor, Standard) mapped to roles | ❌ Not in Excel |
| **Authorization Workflow** | Over-capacity allocations require supervisor approval; partner override capability | ❌ Not in Excel |
| **10 Management Reports** | Utilization & Productivity, WIP Status, Firm Profitability, Revenue per Employee, Actual vs Budget, Turnaround Time, Team Scorecard, Capacity Planning, Overtime & Burnout Risk, Quality Review Exceptions | ❌ Excel only has basic dashboards |
| **Time Tracking** | Actual hours logged against allocations with efficiency classification (Efficient → Significantly Over) | ❌ Excel is static |
| **Reallocation System** | Transfer work between staff (single or split) or roll over to future months with full audit trail | ❌ Not in Excel |
| **Recurring Job Engine** | Auto-generation of allocations for monthly/quarterly/biannual/annual recurrence patterns | ❌ Excel is manually repeated |
| **Departments** | Multi-department support with supervisors, work-status-by-department dashboard | ❌ Not in Excel |
| **Job Templates** | Reusable templates to quickly create standardized jobs | ❌ Not in Excel |
| **Bulk Import/Export** | CSV import for staff, jobs, clients; Power BI export; Sage Accounting sync | ❌ Not in Excel |
| **Notification System** | In-app + email notifications for auth requests, approvals, assignments, deadlines | ❌ Not in Excel |
| **Operational Insights** | AI-style recommendations for under/over-utilized staff, unallocated priority jobs | ❌ Not in Excel |
| **Webhook Integrations** | Power BI, Sage, generic webhook registration | ❌ Not in Excel |
| **SaaS Multi-Tenancy** | Full tenant management, subscription plans (Free/Starter/Professional/Enterprise), PayFast integration | ❌ Not in Excel |
| **Client Management** | Full CRUD with soft-delete, bulk import, contact details, industry classification | ❌ Excel just lists names/fees |
| **Staff Archiving** | Soft-delete with restore capability, preserving audit trail | ❌ Not in Excel |
| **Custom Job Types** | User-defined job types beyond system enums | ❌ Not in Excel |
| **Full Frontend SPA** | 5,456-line React app with 14+ pages: Dashboard, Staff, Jobs, Allocations, Reports, Templates, Timesheet, Departments, Clients, Settings, User Management, Job Types, Login, Analytics | ❌ Not in Excel |

### 1.4 Under-Achieved / Missing Features ⚠️

| Excel Feature | Gap | Impact |
|---|---|---|
| **Work Component Split ratios** | The Excel defines allocation ratios per work type (e.g., MA: 10% Senior / 40% Accountant / 50% Bookkeeper). The code has **no concept of work-type-based allocation ratios** — allocations are free-form percentages to any staff. | 🔴 **High** — Core business logic from the spreadsheet is not codified |
| **Working days per month** | Excel tracks specific working days per month (varies by month/public holidays). Code uses a flat `160 hours/month`. | 🟡 **Medium** — Affects accuracy of budgeted hours |
| **Hours/day calculation** | Excel derives hours/day from `(monthly_hours ÷ working_days)`. Code does not model working days or hours-per-day. | 🟡 **Medium** |
| **Submission date per job** | Excel tracks a submission date for each job entry per month. Code has `deadline` but no distinct submission tracking. | 🟡 **Medium** |
| **Monthly fee totals per person** | Excel shows running monthly totals of scheduled fees per staff member. Code calculates this dynamically but doesn't persist monthly snapshots. | 🟠 **Low-Medium** |
| **Client fee breakdown by role** | Excel splits client fees into role percentages (P: Reviewer %, P: Accountant %, MA: Bookkeeper %, MA: Accountant %, MA: Reviewer %). Code does not model per-client role-based fee splits. | 🔴 **High** — Key data mapping from the spreadsheet |
| **Over/Under analysis per person per month** | Excel has a dedicated section showing over/under scheduled hours and fees per person. Code has analytics but not this specific per-person per-month structured view matching Excel's format. | 🟡 **Medium** |
| **Notes per job per month** | Excel supports free-text notes per job entry each month. Code has `notes` on allocations but not as prominently structured. | 🟢 **Low** |
| **Pricing override** | Excel allows a pricing override per job entry. Code has `job_fee` but no per-allocation pricing override concept. | 🟡 **Medium** |
| **Budgeted WIP column** | Excel has an explicit WIP budget column per job/month. Code derives WIP from allocations but doesn't have a dedicated budgeted WIP field. | 🟡 **Medium** |

### 1.5 Summary Score

| Dimension | Rating |
|---|---|
| **Excel Feature Coverage** | **75%** — Core data models and workflows present; work component split ratios and role-based fee breakdowns are missing |
| **Over-Achievement** | **Significant** — 20+ features beyond Excel (auth, reports, SaaS, notifications, integrations, time tracking) |
| **Under-Achievement** | **Moderate** — Key accounting-specific business rules from the spreadsheet (allocation ratios, working days, role-based fee splits) are not codified |

---

## 2. Principles of Programming

### 2.1 Security 🔒

#### Critical Issues 🔴

| Issue | Details | Severity |
|---|---|---|
| **SHA-256 for password hashing** | `hash_password()` uses plain `hashlib.sha256()` without salt. Vulnerable to rainbow table attacks. Industry standard requires `bcrypt`, `argon2`, or `scrypt`. | 🔴 **Critical** |
| **No auth on ~87+ endpoints** | The `get_current_user()` helper exists but is almost never used as a dependency. Staff, jobs, allocations, all reports, analytics, settings — all publicly accessible without a token. | 🔴 **Critical** |
| **`/api/system/reset` — no auth** | This endpoint **wipes ALL database collections** and has zero authentication. Any HTTP client can destroy all data. | 🔴 **Critical** |
| **`/api/seed` — no auth** | Clears and replaces all data with sample data — completely unprotected. | 🔴 **Critical** |
| **Default password `password123`** | Bulk staff import silently sets `password123` if no password is provided. | 🔴 **Critical** |
| **Regex injection** | Client search uses `{'$regex': f'^{name}$'}` with user-supplied input directly interpolated — enables ReDoS attacks or filter bypass. | 🔴 **High** |
| **CORS wildcard** | Falls back to `allow_origins=["*"]` if env var is not set. | 🟡 **Medium** |

#### Good Security Practices ✅

| Practice | Details |
|---|---|
| **Token-based sessions** | Login creates secure `secrets.token_hex(32)` stored in DB |
| **Password stripping** | `password_hash` consistently removed before returning staff data |
| **Registration approval** | New users require admin/partner approval before access |
| **Duplicate email check** | Registration checks both `staff` and `registration_requests` |
| **Pydantic validation** | Input validation with `gt=0`, `ge=0.1`, `le=1.0`, `min_length`, etc. |
| **File upload validation** | Logo upload checks MIME type and enforces 5MB size limit |
| **Capacity overflow protection** | Allocation checks total_percentage ≤ 100 before allowing |

### 2.2 Modularity & Code Organization 📁

#### Current State: Poor ❌

| Issue | Details |
|---|---|
| **5,104-line monolith** | `server.py` contains ALL models, helpers, enums, routes, business logic, and email templates in a single file |
| **Unused modular structure** | The project has `backend/routes/`, `backend/models/`, `backend/services/`, `backend/utils/` directories with properly separated files — but `server.py` duplicates and ignores them all |
| **Dual route systems** | Routes exist both in `server.py` (as `api_router` decorators) AND in `backend/routes/*.py` (as separate `router` objects). The modular files are either unused or partially registered |
| **No service layer** | Business logic (fee calculations, capacity checks, recurring allocation generation, reallocation logic) is embedded directly in route handlers |
| **Frontend monolith** | `App.js` is 5,456 lines containing 14+ page components, all state management, API calls, utility functions, and inline SVG icons |
| **Empty directories** | `frontend/src/pages/`, `frontend/src/services/`, `frontend/src/hooks/`, `frontend/src/lib/`, `frontend/src/utils/` are all empty — all code lives in `App.js` |

#### What Should Exist (Industry Standard)

```
backend/
  server.py          → 50 lines: app init, middleware, router registration
  middleware/auth.py  → Authentication middleware
  services/           → Business logic (allocation calculation, capacity, reports)
  routes/             → Thin route handlers calling services
  models/             → Data models only
  
frontend/src/
  pages/              → One file per page component
  services/api.js     → Centralized API client
  hooks/              → Custom React hooks
  components/         → Reusable UI components
  utils/              → Formatting, helpers
```

### 2.3 DRY (Don't Repeat Yourself) 🔁

| Violation | Details |
|---|---|
| **Duplicate models** | `StaffMember`, `Job`, `Allocation`, `Settings` etc. are defined in BOTH `server.py` AND `backend/models/*.py` — with **divergent field definitions** |
| **Duplicate routes** | Auth, staff, jobs, allocations routes exist in both `server.py` and `backend/routes/*.py` |
| **Duplicate helper functions** | `hash_password()`, `verify_password()`, `generate_token()` defined in both `server.py` and `backend/utils/helpers.py` |
| **Duplicate fee calculation** | Allocation fee/hours calculations repeated in multiple route handlers |
| **Frontend duplication** | Icons, utility functions, formatting helpers all inline in `App.js` instead of imported from component files |

### 2.4 SOLID Principles

| Principle | Adherence | Assessment |
|---|---|---|
| **S — Single Responsibility** | ❌ Poor | `server.py` handles auth, CRUD, analytics, reports, email, integrations. `App.js` handles all UI, state, and API calls. |
| **O — Open/Closed** | ❌ Poor | Adding a new report or feature requires modifying the monolith files. No plugin/extension architecture. |
| **L — Liskov Substitution** | ⚠️ N/A | Not applicable — no inheritance hierarchy used. |
| **I — Interface Segregation** | ❌ Poor | `App.js` passes 10+ props down to every page component. No context providers or state management. |
| **D — Dependency Inversion** | ❌ Poor | Route handlers directly call `db.collection.find()` — tightly coupled to MongoDB. No repository pattern. |

### 2.5 Error Handling ⚠️

| Aspect | Assessment |
|---|---|
| **HTTP error codes** | ✅ Good — Consistent use of 400, 401, 404 with descriptive messages |
| **Global error handler** | ❌ Missing — No middleware to catch unhandled exceptions |
| **Frontend error handling** | ⚠️ Partial — Uses `try/catch` with `toast.error()` but no error boundaries |
| **Database error handling** | ❌ Poor — No handling for connection failures, timeouts, or write conflicts |
| **Validation errors** | ⚠️ Mixed — Some endpoints use Pydantic models (strong), others accept raw `dict` (weak) |

### 2.6 Testing 🧪

| Aspect | Assessment |
|---|---|
| **Backend tests** | `backend/tests/test_phase1_features.py` exists — scope unknown |
| **Root-level tests** | `backend_test.py`, `brendmo_test.py`, `david_supervisor_test.py`, `supervisor_visibility_test.py` — integration tests |
| **Frontend tests** | ❌ None — No test files, no testing library in `package.json` |
| **Test coverage** | ❌ Unknown — No coverage configuration |
| **CI/CD** | ❌ None — No GitHub Actions, no pipeline config |

### 2.7 Performance & Scalability 📈

| Issue | Details | Impact |
|---|---|---|
| **N+1 query problem** | Analytics endpoints loop through items making individual DB queries per record | 🔴 Will degrade at scale |
| **No pagination** | All list endpoints use `.to_list(1000)` hard limits | 🔴 Memory issues with growth |
| **No database indexes** | No index creation for commonly queried fields (`staff_id`, `job_id`, `month`, `email`) | 🔴 Slow queries at scale |
| **No caching** | Dashboard summaries, analytics, and reports recalculate from scratch every request | 🟡 Unnecessary load |
| **No connection pooling config** | MongoDB client uses defaults | 🟡 May hit limits under load |

### 2.8 Code Quality & Standards 📐

| Aspect | Assessment |
|---|---|
| **Linting** | `flake8`, `black`, `isort`, `mypy` in `requirements.txt` — but no config files or evidence of enforcement |
| **Type hints** | ✅ Good — Pydantic models use proper typing; some route handlers use untyped `dict` |
| **Documentation** | ⚠️ Partial — Docstrings on most route handlers; no README for backend setup |
| **Naming conventions** | ✅ Good — Consistent `snake_case` for Python, `camelCase` for JS |
| **Environment config** | ✅ Good — Uses `.env` with `python-dotenv`, `MONGO_URL`, `DB_NAME` externalized |
| **Logging** | ⚠️ Minimal — Logger configured but used only in email functions |
| **Git hygiene** | ⚠️ Unknown — No `.gitignore` visible in workspace listing |

---

## 3. Improvements

### 3.1 Critical Fixes (Must Do Before Production)

| # | Improvement | Estimated Time | Priority |
|---|---|---|---|
| 1 | **Replace SHA-256 with bcrypt** for password hashing | 2–3 hours | 🔴 Critical |
| 2 | **Add authentication middleware** to all API routes | 1–2 days | 🔴 Critical |
| 3 | **Remove or protect `/api/system/reset` and `/api/seed`** — gate behind env flag or auth | 1 hour | 🔴 Critical |
| 4 | **Remove default password `password123`** from bulk import | 30 min | 🔴 Critical |
| 5 | **Sanitize regex inputs** — escape user input in MongoDB `$regex` queries | 2–3 hours | 🔴 High |
| 6 | **Lock down CORS** — require explicit origin list, never default to `*` | 30 min | 🟡 Medium |

### 3.2 Architecture Improvements (For the Node.js/Express Port)

| # | Improvement | Estimated Time | Description |
|---|---|---|---|
| 7 | **Split the monolith into proper modules** | 3–5 days | Separate `server.py` (5,104 lines) into proper route files, service layer, and models. This is the **#1 priority** for the Node.js port — do not recreate the monolith. |
| 8 | **Split `App.js` into page components** | 3–5 days | Extract the 14+ page components from `App.js` (5,456 lines) into individual files under `src/pages/`. Extract API calls into `src/services/api.js`. |
| 9 | **Implement proper service layer** | 3–4 days | Business logic (fee calculation, capacity checks, recurring allocation generation) should live in `services/` not in route handlers. |
| 10 | **Add database indexes** | 2–3 hours | Create indexes on `staff.email`, `staff.id`, `allocations.staff_id`, `allocations.month`, `allocations.job_id`, `jobs.id`, `jobs.status`, `tokens.token`. |
| 11 | **Add pagination** | 1–2 days | Replace `.to_list(1000)` with proper `skip`/`limit` pagination with total count. |
| 12 | **Implement repository pattern** | 2–3 days | Abstract DB operations behind a data access layer — enables easier testing and potential DB migration. |

### 3.3 Feature Improvements

| # | Improvement | Estimated Time | Description |
|---|---|---|---|
| 13 | **Implement work component split ratios** | 2–3 days | Codify the Excel's core business rule: when a job is allocated, automatically suggest/enforce role-based split percentages per work type. |
| 14 | **Add working days per month** | 1 day | Model SA public holidays and actual working days per month instead of flat 160 hours. |
| 15 | **Add per-client role-based fee splits** | 2 days | Mirror the Excel's per-client allocation percentages (P: Reviewer %, P: Accountant %, MA: Bookkeeper %, etc.). |
| 16 | **Add monthly snapshot/archiving** | 1–2 days | Persist monthly totals (fees, hours, utilization) at month-end for historical comparison. |
| 17 | **Add pricing override per allocation** | 4–6 hours | Allow override of the standard fee calculation on individual allocations, matching Excel's pricing override column. |
| 18 | **Add submission date tracking** | 3–4 hours | Distinct from deadline — track when work was actually submitted/completed per job per month. |

### 3.4 Quality & DevOps Improvements

| # | Improvement | Estimated Time | Description |
|---|---|---|---|
| 19 | **Add comprehensive test suite** | 5–7 days | Unit tests for services, integration tests for API routes, frontend component tests with React Testing Library. |
| 20 | **Set up CI/CD pipeline** | 1 day | GitHub Actions or similar: lint, test, build on every PR. |
| 21 | **Add rate limiting** | 3–4 hours | Protect login and registration endpoints from brute-force attacks. Use `express-rate-limit` in Node.js. |
| 22 | **Add global error handler** | 2–3 hours | Express middleware for unhandled errors with proper logging and sanitized responses. |
| 23 | **Add request logging** | 2–3 hours | Structured logging for all API requests with response times (use `morgan` or `pino` in Node.js). |
| 24 | **Add API documentation** | 1 day | Auto-generate OpenAPI/Swagger docs (FastAPI does this natively; use `swagger-jsdoc` for Express). |
| 25 | **Add environment validation** | 2–3 hours | Validate required environment variables at startup (use `joi` or `envalid` in Node.js). |

### 3.5 Recommendations for the Node.js / Express Port

#### Recommended Architecture

```
node-server/
├── src/
│   ├── app.js                    # Express app config (CORS, middleware, router mount)
│   ├── server.js                 # HTTP server startup
│   ├── config/
│   │   ├── env.js                # Environment validation (envalid)
│   │   ├── db.js                 # MongoDB connection (mongoose or native driver)
│   │   └── cors.js               # CORS configuration
│   ├── middleware/
│   │   ├── auth.js               # JWT authentication middleware
│   │   ├── rbac.js               # Role-based access control
│   │   ├── errorHandler.js       # Global error handler
│   │   ├── rateLimiter.js        # Rate limiting
│   │   └── validate.js           # Request validation (joi/zod)
│   ├── models/                   # Mongoose schemas / data models
│   │   ├── Staff.js
│   │   ├── Job.js
│   │   ├── Allocation.js
│   │   ├── Client.js
│   │   ├── Department.js
│   │   ├── TimeEntry.js
│   │   └── ...
│   ├── services/                 # Business logic layer
│   │   ├── authService.js        # Login, register, token management
│   │   ├── allocationService.js  # Fee calc, capacity check, recurring generation
│   │   ├── reportService.js      # Report generation logic
│   │   ├── emailService.js       # Email notifications
│   │   └── ...
│   ├── controllers/              # Thin route handlers calling services
│   │   ├── authController.js
│   │   ├── staffController.js
│   │   ├── jobsController.js
│   │   └── ...
│   ├── routes/                   # Route definitions
│   │   ├── index.js              # Route aggregator
│   │   ├── auth.js
│   │   ├── staff.js
│   │   └── ...
│   └── utils/
│       ├── pagination.js         # Pagination helpers
│       ├── formatters.js         # Currency, date formatters
│       └── validators.js         # Shared validation schemas
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
├── package.json
├── .env.example
└── README.md
```

#### Key Technology Recommendations

| Concern | Recommendation | Rationale |
|---|---|---|
| **Authentication** | JWT with `jsonwebtoken` + `bcrypt` | Industry standard; stateless auth with proper password hashing |
| **Validation** | `zod` or `joi` | Runtime schema validation for all request bodies |
| **Database** | Mongoose ODM or native MongoDB driver with explicit schemas | Type safety, middleware hooks, population |
| **Error Handling** | Custom `AppError` class + global middleware | Consistent error responses across all endpoints |
| **Logging** | `pino` or `winston` | Structured JSON logging with request correlation IDs |
| **Testing** | `jest` + `supertest` | Unit + integration testing with HTTP assertions |
| **Rate Limiting** | `express-rate-limit` | Protect auth endpoints, 100 req/min default |
| **API Docs** | `swagger-jsdoc` + `swagger-ui-express` | Auto-generated OpenAPI docs from JSDoc comments |
| **Environment** | `envalid` | Validate all env vars at startup with types and defaults |
| **Security Headers** | `helmet` | Set secure HTTP headers (XSS, HSTS, CSP, etc.) |

#### Migration Priority Order

| Phase | Items | Duration |
|---|---|---|
| **Phase 1: Foundation** | Project scaffold, DB connection, env config, auth middleware (JWT + bcrypt), RBAC middleware, error handling | 3–4 days |
| **Phase 2: Core CRUD** | Staff, Jobs, Clients, Departments, Settings — models, services, routes | 4–5 days |
| **Phase 3: Business Logic** | Allocations (fee calc, capacity, recurring), Time entries, Authorization workflow | 4–5 days |
| **Phase 4: Analytics & Reports** | Dashboard endpoints, 10 reports, management insights, efficiency analytics | 3–4 days |
| **Phase 5: Advanced Features** | Notifications, email service, webhooks, templates, bulk import/export | 3–4 days |
| **Phase 6: Missing Excel Features** | Work component split ratios, working days/month, role-based fee splits, pricing overrides | 3–4 days |
| **Phase 7: Quality** | Test suite, CI/CD, API docs, rate limiting, logging, monitoring | 3–5 days |
| | **Total Estimated** | **23–31 working days (~5–6 weeks)** |

### 3.6 Frontend Recommendations

| # | Improvement | Estimated Time |
|---|---|---|
| 1 | Split `App.js` into individual page components in `src/pages/` | 2–3 days |
| 2 | Create centralized API service in `src/services/api.js` with Axios interceptors | 1 day |
| 3 | Move icons to `src/components/common/Icons.jsx` (already partially exists) | 3–4 hours |
| 4 | Implement React Router for proper page navigation (already installed) | 1 day |
| 5 | Add state management (React Context or Zustand) to replace prop drilling | 1–2 days |
| 6 | Add loading skeletons and error boundaries | 1 day |
| 7 | Add frontend tests with React Testing Library | 3–5 days |
| 8 | Consider migrating to TypeScript for type safety | 3–5 days (optional) |

---

## Summary

| Area | Current State | Target State |
|---|---|---|
| **Excel Feature Parity** | 75% | 95%+ with work-split ratios and role-based fee breakdowns |
| **Security** | 🔴 Critical gaps (no auth middleware, SHA-256 passwords, unprotected reset endpoints) | 🟢 JWT + bcrypt + RBAC + rate limiting |
| **Modularity** | 🔴 Two monolith files (5,104 + 5,456 lines) | 🟢 Proper MVC with service layer |
| **Testing** | 🔴 Minimal | 🟢 80%+ coverage with unit + integration tests |
| **Performance** | 🟡 N+1 queries, no pagination, no indexes | 🟢 Indexed queries, pagination, caching |
| **Code Quality** | 🟡 Linters installed but not enforced | 🟢 CI-enforced linting, formatting, type checks |
| **DevOps** | 🔴 No CI/CD | 🟢 Automated pipeline: lint → test → build → deploy |

> **Bottom Line:** The application has a **rich feature set that significantly exceeds the Excel's scope**, but it is built on a fragile foundation. The Node.js port is the right opportunity to properly architect the system — do not recreate the monolith. Prioritize security, modularity, and test coverage in the rewrite.
