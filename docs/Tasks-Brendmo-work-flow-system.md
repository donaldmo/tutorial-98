# Tasks Brendmo work-flow system

Simple grouped todo list after final codebase verification (10 Mar 2026).

## Status key
- ☐ Not started
- 🔄 Started
- ✅ Done

## Final verification snapshot (what was confirmed)
- Backend monolith is very large: `backend/server.py` (~5103 lines)
- Frontend monolith is very large: `frontend/src/App.js` (~5455 lines)
- Dual backend exists (FastAPI + Node), increasing maintenance overhead
- SHA-256 password hashing is still used in multiple backend files
- Destructive endpoints `/system/reset` and `/seed` are present
- Regex queries use user input in multiple places
- CORS is partially addressed (Node side strict, Python side still allows `*` fallback)
- CI workflow files are missing (`.github/workflows` not found)
- Frontend test files are missing

## Group 1: Security (Top Priority)
- ✅ Replace SHA-256 password hashing with bcrypt/passlib
- ✅ Enforce auth on all protected API routes
- ✅ Protect or disable `/system/reset` and `/seed` in production
- ✅ Remove default import password behavior
- ✅ Sanitize regex-based filters
- ✅ Restrict CORS to explicit allowed origins (Node mostly done, backend still open)

## Group 2: Architecture Cleanup
- ✅ Choose one backend runtime as primary (FastAPI)
- ✅ Remove duplicate route/model definitions
- ✅ Move business logic into service layer
- ✅ Split large frontend page logic into feature modules

## Group 3: Excel/Workflow Parity Features
- 🔄 Add job-type work component split rules
- 🔄 Add per-client role-based fee split configuration
- 🔄 Add working-days calendar and derived capacity logic
- 🔄 Add submission date, pricing override, and budgeted WIP fields
- 🔄 Add monthly snapshot history and over/under reporting

## Group 4: Performance & Reliability
- ☐ Add DB indexes for common filters
- ☐ Add pagination to list endpoints
- ☐ Optimize analytics/report query patterns
- ☐ Standardize API error handling and structured logging

## Group 5: Quality & Delivery
- 🔄 Define test coverage targets
- ☐ Add backend tests for auth/allocation/reporting
- ☐ Add frontend tests for login/dashboard/allocation/reports
- ☐ Add CI checks (lint + test + build)

---

## Quick Weekly Tracker
- Week 1 focus: Group 1
- Week 2 focus: Group 2
- Week 3 focus: Group 3
- Week 4 focus: Group 4 + Group 5

## Progress Notes
- Date: 2026-03-10
- What started:
	- CORS hardening across both backends
	- Architecture decision task (single backend direction)
	- Test/CI baseline definition
-	- Group 2 implementation kickoff: FastAPI selected as primary backend
-	- Started service-layer extraction in backend (`backend/services/staff_service.py`) and wired key staff endpoints from `backend/server.py`
- What finished:
-	- Architecture decision completed: FastAPI is primary backend runtime for current consolidation phase
- Blockers:
	- Need phased deprecation plan for duplicate Node/FastAPI route surfaces to avoid breaking consumers
