# API curl test suite (initial implementation)

This folder contains the first implemented scenarios from the integration testing plan.

## Prerequisites

- Node API server running (default expected: `http://localhost:${PORT:-8080}/api`)
- Existing login user for staff auth route
- `curl` and `jq` installed

## Environment variables

- `BASE_URL` (if set without `/api`, tests append `/api` automatically)
- `PORT` (used when `BASE_URL` is unset, default `8080`)
- `TEST_ADMIN_EMAIL` (default: `admin@example.com`)
- `TEST_ADMIN_PASSWORD` (default: `Admin@12345678`)

Example:

```bash
export BASE_URL="http://localhost:5500"
export TEST_ADMIN_EMAIL="real.user@company.com"
export TEST_ADMIN_PASSWORD="real-password"
```

## Run tests

Run all currently implemented scenarios:

```bash
bash node-server/tests/test_api/run-all.sh
```

Run a single scenario:

```bash
bash node-server/tests/test_api/staff/add-employee-success.sh
```

## Implemented scenarios

- `auth/login-success.sh`
- `auth/logout-success.sh`
- `auth/me-unauthorized.sh`
- `auth/admin-create-organisation-unauthorized.sh`
- `health/health-success.sh`
- `staff/add-employee-success.sh`
- `staff/add-employee-validation-fail.sh`
- `staff/staff-crud-success.sh`
- `jobs/jobs-crud-success.sh`
- `allocations/allocations-crud-success.sh`
- `time-entries/time-entries-crud-success.sh`
- `departments/departments-crud-success.sh`
- `dashboard/dashboard-success.sh`
- `analytics/analytics-success.sh`
- `reports/reports-success.sh`
- `import-export/import-export-success.sh`
- `authorization/authorization-workflow-success.sh`
- `notifications/notifications-success.sh`
- `webhooks/webhooks-success.sh`
- `saas/tenant-flow-success.sh`
- `saas/super-admin-success.sh`
- `saas/public-register-success.sh`
- `workflow/admin-add-employee-end-to-end.sh`

More scenarios can now be added per the plan in `docs/api-testing-plan.md`.
