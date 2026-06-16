# API Integration Testing Plan (curl, scenario-based)

## 1) Goal

Define a practical integration test plan for the API using **curl** with scenario-based coverage:

- Validate real user workflows (not only isolated endpoints)
- Verify auth + role/claim behavior
- Confirm response status, shape, and key fields
- Separate tests by domain directory for maintainability

---

## 2) Scope

### In scope
- Authentication flow (login, token handling)
- Core business flows (staff/employees, jobs, allocations, time entries)
- SaaS/tenant flow where applicable
- Validation and authorization failures
- “Obvious” API behavior checks (CRUD happy path + common negative cases)

### Out of scope (phase 1)
- UI/browser tests
- Load/performance tests
- Full fuzz/security penetration testing

---

## 3) Test approach

- Use shell scripts with `curl` as the execution engine
- Reuse shared helpers for:
  - base URL
  - auth token retrieval
  - standard headers
  - basic assertions (status/body fields)
- Prefer deterministic test data (`TEST_*` prefixes)
- Run tests against isolated env/database

---

## 4) Proposed directory structure

```text
tests/
  test_api/
    _shared/
      env.sh
      auth.sh
      assert.sh
      cleanup.sh
    auth/
      login-success.sh
      login-invalid-password.sh
      me-unauthorized.sh
    staff/
      add-employee-success.sh
      add-employee-validation-fail.sh
      add-employee-unauthorized.sh
      list-staff-success.sh
      update-staff-success.sh
      delete-staff-success.sh
    jobs/
      create-job-success.sh
      create-job-validation-fail.sh
      list-jobs-success.sh
    allocations/
      create-allocation-success.sh
      create-allocation-conflict.sh
    time_entries/
      create-time-entry-success.sh
      create-time-entry-validation-fail.sh
    saas/
      add-tenant-success.sh
      add-tenant-duplicate-fail.sh
    workflow/
      admin-add-employee-end-to-end.sh
      employee-job-allocation-time-entry.sh
```

> If you specifically want TypeScript wrappers like `test_api/add-tenant.ts`, keep curl in subprocess calls, but phase 1 is simplest with `.sh`.

---

## 5) Scenario catalog (phase 1)

## A. Auth scenarios
1. Login with valid credentials → `200`, token present  
2. Login invalid password → `401/400`, error message present  
3. Access protected endpoint without token → `401`

## B. Staff/employee scenarios
1. Logged-in admin-type user adds employee  
   - Request: `POST /api/staff` (or actual route from code)  
   - Expect: `201` (or defined success code)  
   - Confirm response object includes created employee fields + tenant context if applicable  
2. Missing required fields → `400` with validation details  
3. Duplicate unique field (email/code) → `409/400`  
4. Update employee → success response with updated fields  
5. Delete employee → success + not found on follow-up fetch

## C. Jobs/allocations/time entries
1. Create job with valid payload → success  
2. Create allocation for existing entities → success  
3. Create allocation with invalid refs/conflict → fail with expected status  
4. Create time entry in valid range → success  
5. Invalid time entry (negative/overlap/missing fields) → fail

## D. SaaS/Tenant scenarios
1. Create tenant successfully  
2. Duplicate tenant identifier → error  
3. Tenant-scoped access only returns tenant data

## E. End-to-end workflow scenarios
1. Login → add employee → assign job/allocation → submit time entry  
2. Verify all intermediate IDs and relationships in responses

---

## 6) Required assertions per test

Each test should assert:

- HTTP status code
- JSON `success`/`message` contract (if present)
- Required object keys (`id`, `createdAt`, etc.)
- Tenant scoping field(s) where expected
- Error contract for failures (`error`, `details`, validation path)

---

## 7) Shared helper conventions

- `env.sh`: `BASE_URL`, test credentials, tenant IDs
- `auth.sh`: login and export `TOKEN`
- `assert.sh`:
  - `assert_status expected actual`
  - `assert_json_has_key body key`
  - `assert_json_equals body jq_path expected`
- Use `jq` for parsing JSON from curl output

---

## 8) Example workflow (admin adds employee)

1. Login as admin-type user  
2. `POST /api/staff` with employee payload  
3. Assert:
   - status is success (`201` preferred)
   - confirmation message exists
   - response object has employee ID and expected fields
   - tenant field/association is correct (if multi-tenant)

---

## 9) Execution

- Run one domain:
  - `bash tests/test_api/staff/add-employee-success.sh`
- Run full suite:
  - `find tests/test_api -name "*.sh" -print0 | xargs -0 -n1 bash`
- CI should fail fast on first error (phase 1), then move to full report mode later

---

## 10) Definition of Done

- All planned phase-1 scenarios implemented
- Tests grouped by directory/domain
- Shared helpers reduce duplication
- Tests pass reliably in CI for seeded test environment
- Documentation updated with endpoint-to-test mapping
