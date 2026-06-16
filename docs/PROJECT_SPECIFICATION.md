# Brendmo Workflow Planner — Project Specification

> **Brendmo Chartered Accountants** — "Accountability Partners"
> A web-based workflow planning and management system for accounting and consulting firms.

---

## 1. System Overview

### 1.1 Purpose

Brendmo Workflow Planner helps accounting firms manage their entire practice:

- **Staff management** — roles, capacities, performance
- **Client & job tracking** — engagement types, deadlines, fees
- **Work allocation** — staff-to-job assignment with fee-based capacity planning
- **Time tracking** — actual vs budgeted hours per allocation
- **Reporting & analytics** — utilization, profitability, efficiency, WIP, capacity

### 1.2 Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.9+ / FastAPI (single-file `server.py`) |
| Database | MongoDB (via Motor async driver) |
| Frontend | React 19 / Tailwind CSS (single-file `App.js` SPA) |
| Auth | Token-based (SHA-256 hashing, MongoDB sessions) |
| UI Library | shadcn/ui (Radix primitives) + lucide-react icons |
| Package Mgmt | yarn (frontend), pip (backend) |

### 1.3 Architecture

- **Monolithic SPA** — no router; state-based tab routing via `activeTab` variable
- **Root data fetch pattern** — 8 parallel API calls on load; data flows down via props
- **Mutation callback** — every CRUD operation calls `onRefresh={fetchData}` to re-fetch all root data
- **No caching** — raw axios + useState/useEffect; no React Query or SWR

---

## 2. User Roles & Access Control

### 2.1 Staff Roles

Staff members are assigned a role that determines their default access level:

| Role | Default Access Level |
|---|---|
| Partner | Full |
| Director | Full |
| Manager | Supervisor |
| Senior Accountant | Standard |
| Accountant | Standard |
| Junior Accountant | Standard |
| Trainee | Standard |
| Admin | Admin |
| Supervisor | Supervisor |

### 2.2 Access Levels

| Access Level | Pages Available |
|---|---|
| **Full** | All 14 tabs: Dashboard, My Dashboard, My Timesheet, Staff, Clients, Jobs, Templates, Allocations, Departments, Reports, Efficiency, Job Types, User Management, Settings |
| **Admin** | Same as Full (can manage system settings) |
| **Supervisor** | 8 tabs: Dashboard, My Dashboard, My Timesheet, Staff, Jobs, Allocations, Reports, Efficiency |
| **Standard** | 3 tabs: My Dashboard, My Timesheet, My Allocations |

### 2.3 Guest Mode

Users can skip login to explore the system. The app picks the first Partner/Director from the database and creates a fake Full-access user profile.

---

## 3. Scenario-Based Feature Walkthrough

### 3.1 My Timesheet

**Scenario**: *As a staff accountant, I want to see my work for the month and log my hours.*

1. I navigate to **My Timesheet** which fetches all my allocations for the selected month
2. I see summary cards showing:
   - **Total Budgeted Hours** — sum of all my allocated hours for the month
   - **Total Logged Hours** — hours I've already recorded
   - **Variance** — difference between budgeted and actual
   - **Jobs Assigned** — number of active allocations
3. Below the summary, each allocation is displayed as a card:
   - Job name, client, allocation percentage, allocated fee
   - Progress bar showing logged vs budgeted
   - Efficiency indicator (color-coded: green = efficient, red = significantly over)
   - Table of time entries I've already logged
4. I click "Log Time" on an allocation to open a modal where I enter:
   - Date (date picker)
   - Hours worked (0.25-hour increments)
   - Description (minimum 5 characters)
5. The system updates the totals and efficiency status in real time
6. I can delete a time entry if I made a mistake

**Key Metric**: Efficiency = budgeted hours vs actual hours logged. Classifications: Efficient, Slightly Over, Over Budget, Significantly Over.

---

### 3.2 Staff

**Scenario**: *As a practice manager, I need to maintain my team's profiles and permissions.*

1. I navigate to **Staff** which shows a table of all staff members
2. I see for each staff member: Name, Role, Access Level (color-coded badge), Hourly Rate, Annual Budget, Status (Active/Archived)
3. **Creating a staff member**: I fill in name, role (auto-sets access level), hourly rate, available hours per month, productivity factor, annual fee budget, annual budgeted hours, email, phone, team, manager, and one or more departments
4. **Managing permissions**: I click the shield icon to set a staff member's access level (Full/Admin/Supervisor/Standard) and whether they can delete records
5. **Setting passwords**: I click the key icon to set or reset a password (minimum 6 characters, with show/hide toggle)
6. **Archiving**: I archive departing staff — this soft-deletes them, marks their active allocations as `needs_reallocation`, and sets them inactive
7. **Bulk import**: I can paste CSV data to create multiple staff at once — the system validates emails for uniqueness and reports success/failure counts
8. **Department assignment**: I assign staff to one or more departments using toggle chips (fetched from the Departments page)
9. Archived staff can be restored (which re-activates them) or permanently deleted

**Business rules**:
- `access_level` is auto-derived from `role` but can be overridden by Full-level users
- Only Full-level users can change permissions on other staff
- Staff with `can_delete = false` cannot be deleted from the system
- Archiving a staff member triggers reallocation warnings on their current allocations

---

### 3.3 Clients

**Scenario**: *As a partner, I maintain my firm's client base.*

1. I navigate to **Clients** which lists all clients with search/filter
2. Stats cards show: Total Active, Inactive, Unique Industries, and Showing count
3. I can search by name, contact person, email, or industry
4. **Creating a client**: I enter name (must be unique, case-insensitive), contact person, email, phone, address, industry, notes
5. **Deactivating a client**: Soft-delete (sets `is_active = false`) — the record is preserved but filtered out of `active_only=true` queries
6. **Bulk import**: I paste JSON data to create multiple clients at once
7. The table shows: Client Name, Contact Person, Email, Phone, Industry, Actions

**Connection**: Clients are used as dropdown data in the **Jobs** page, which also has a "Quick Create Client" option when entering a new job.

---

### 3.4 Jobs

**Scenario**: *As a manager, I create engagements for my clients and track their progress.*

1. I navigate to **Jobs** which shows all jobs in a table
2. Columns: Job Name, Client, Type, Fee, Deadline (with overdue/urgency coloring), Frequency (badge for recurring jobs), Status (color-coded)
3. **Creating a job**: I fill in:
   - **Basic Info**: name, client (dropdown with "Create New Client" option), job type (dropdown with "Create New Job Type" option), fee, minimum role, priority, deadline, description, department
   - **Frequency**: once-off or recurring (monthly/bi-monthly/quarterly/biannually/annually) with start/end dates
   - **Retainer**: checkbox to mark as retainer client with monthly fee
4. Job status is **auto-managed** by the system based on allocations:
   - `PENDING` → no allocations
   - `PARTIALLY_ALLOCATED` → some allocations (< 100%)
   - `FULLY_ALLOCATED` → allocations sum to 100%
   - `IN_PROGRESS` → time has been logged
   - `COMPLETED` → marked done by user
   - `ON_HOLD` / `PENDING_AUTHORIZATION`
5. Deadline formatting shows "Overdue" in red, or "X days remaining" in orange/blue
6. **Bulk import**: CSV upload with validation against system job types

**Business rules**:
- Financial year is calculated from the job's creation year
- Recurring jobs auto-generate allocations for each month in the recurrence range
- Retainer jobs have a fixed monthly fee rather than a job fee + allocation percentage

---

### 3.5 Job Types

**Scenario**: *As a manager, I want to categorize the work my firm does — some types are standard to the profession, others are unique to my firm.*

1. I navigate to **Job Types** which has two tabs:
   - **Custom Types** — types I create and manage
   - **System Types** — predefined types that are read-only
2. **System types** (canonical list): Bookkeeping, Tax Compliance, SARS EMP201/501, SARS IT14 Returns, VAT Returns, CIPC Annual Returns, CIPC Company Registration, B-BBEE Verification, Statutory Audit, Internal Audit, Review Engagement, Advisory Services, Consulting, Payroll Processing, Annual Financial Statements, Management Accounts, Other
3. **Custom types**: I can create my own (name + description), edit them, or mark them inactive. Names must be unique (case-insensitive)
4. Custom job types appear alongside system types in the Jobs dropdown

---

### 3.6 Templates

**Scenario**: *As a manager, I frequently assign similar types of work. I want to define reusable templates so I can spin up new jobs quickly.*

1. I navigate to **Templates** which shows a card grid layout
2. Each card displays: name, priority badge, job type, default fee, estimated hours, minimum role, description
3. **Creating a template**: I define name, job type (from system/custom types), default fee, estimated hours, default priority, minimum role, and description
4. **Using a template**: I click "Create Job" on a template card, which opens a modal where I enter:
   - Client name (overrides the template's generic setup)
   - Job fee (pre-filled from template default, editable)
   - Deadline
5. The system creates a new job with all template defaults pre-applied

---

### 3.7 Allocations

**Scenario**: *As a manager/supervisor, I allocate my team members to client jobs. The system calculates hours from the fee, checks capacity, and may require authorization if someone is overloaded.*

This is the **core workflow** of the application.

#### 3.7.1 Creating an Allocation

1. I select a **Job** from the dropdown (only shows PENDING or PARTIALLY_ALLOCATED jobs)
2. I select a **Staff member** — the system shows their current utilization percentage and warns if they're near capacity
3. I set the **Percentage** (slider + number input) — this represents the portion of the job fee this staff member is responsible for
4. The system calculates a preview:
   - `Allocated Fee = Job Fee × (Percentage / 100)`
   - `Calculated Hours = Allocated Fee / Staff Hourly Rate`
   - `Adjusted Hours = Calculated Hours / Staff Productivity Factor`
5. I set the **Target Month** (defaults to current month, can allocate to future months)
6. I click "Allocate"

#### 3.7.2 Capacity Check & Authorization Workflow

If the staff member's utilization reaches **≥90%** after this allocation:

1. The "Allocate" button changes to "Request Authorization"
2. A modal prompts me to enter a **reason** for over-allocating
3. A pending authorization request is created with the following metadata: staff member, job, percentage, requester, reason, timestamp
4. An in-app notification is sent to the department supervisor
5. **Supervisor/Partner view**: A "Pending Authorization Requests" section appears on the Allocations page listing all requests
6. The supervisor can **Approve** (which creates the allocation) or **Reject**
7. On rejection, the requester receives a notification
8. Full-level partners have an **Override** option that bypasses the normal approval

#### 3.7.3 Viewing Allocations

- **Current Allocations table**: Job, Staff, Percentage, Fee Portion, Adjusted Hours, Calculated Hours, Actions
- Each row has: Log Time, Reallocate, Delete buttons
- Recurring job allocations show a repeat badge
- Pending authorization requests appear in a dedicated section above the table

#### 3.7.4 Reallocation

If a staff member leaves or needs to redistribute work:

1. I click "Reallocate" on an existing allocation
2. I choose **transfer type**:
   - **Single staff transfer** — move the entire allocation to another staff member
   - **Split transfer** — split the allocation between two staff members
3. I enter the new staff member(s), percentage to transfer, and a reason
4. The system fetches the current time summary (how many hours have been logged) and calculates remaining hours for transfer
5. The original allocation is marked as `reallocated` or `partial_reallocation` and the new allocation is created

#### 3.7.5 Recurring Allocations

When viewing allocations for a given month (`GET /api/allocations?month=YYYY-MM`):

1. The system checks for recurring jobs whose recurrence range covers the requested month
2. It copies allocations from the source month, recalculates hours/fees for the target month
3. It skips if allocations already exist for that job+month combination
4. Recurrence types: monthly (1 month back), bi-monthly (2), quarterly (3), biannually (6), annually (12)

---

### 3.8 Departments

**Scenario**: *As a partner, I organize my firm into departments (Tax, Audit, Advisory) and assign staff and jobs to them.*

1. I navigate to **Departments** which shows a card grid
2. Each card displays: Department Code badge (e.g., "TAX"), full name, description, supervisor name and role
3. **Creating a department**: I enter name, code (uppercase, max 5 chars, unique), description, and select a supervisor from Partner/Director/Manager/Supervisor roles
4. Departments are used throughout the system:
   - **Staff** — multi-select department assignment for each staff member
   - **Jobs** — filter by department
   - **Dashboard** — work status grouped by department
   - **Allocations** — filter by department
   - **Reports** — filter by department

---

### 3.9 Reports

**Scenario**: *As a partner or manager, I need to see how my firm is performing — utilization, profitability, WIP, capacity, and team efficiency.*

The Reports page provides 10 analytical reports with drill-down to detail and CSV/PDF export. Each report can be filtered by period (monthly, annual, or custom date range).

#### 3.9.1 Utilization & Productivity

**Purpose**: See who's under/over-utilized and how productive staff are with their allocated time.

**Metrics shown**:
- Firm-wide utilization %
- Per-staff: `Utilization = Allocated Hours / Period Budget × 100`
- Per-staff: `Productivity = Actual Hours Logged / Allocated Hours × 100`
- Filters to see which staff are under-utilized (<50%) or over-utilized (>90%)

**Drill-down**: Click a staff member to see their allocations, time entries, and monthly trend.

#### 3.9.2 WIP Status

**Purpose**: Track unbilled work-in-progress to manage cash flow and backlog.

**Logic**:
- Excludes completed jobs
- For each job: `WIP Value = Allocated Fee × (Actual Hours / Budgeted Hours)`
- Groups by service line (job type)
- Shows total WIP value and count of active jobs

**Drill-down**: Click a service line to see which jobs contribute to the WIP.

#### 3.9.3 Firm Profitability

**Purpose**: Understand which service lines are most profitable.

**Logic**:
- By service line (job type)
- `Revenue = Sum of job fees`
- `Labor Cost = Actual Hours × Hourly Rate × 0.5` (assumes 50% cost-to-charge ratio)
- `Gross Margin = Revenue - Labor Cost`
- `Margin % = Gross Margin / Revenue × 100`

**Drill-down**: Click a service line to see per-job profitability.

#### 3.9.4 Revenue per Employee

**Purpose**: Measure revenue contribution per staff member.

**Logic**:
- Per staff: `Net Contribution = Allocated Revenue - Estimated Cost`
- Groups by team/department
- Shows ranking within the firm

**Drill-down**: Click a staff member to see their per-job revenue breakdown.

#### 3.9.5 Actual vs Budgeted

**Purpose**: Identify jobs that are going over budget.

**Logic**:
- Groups time entries by allocation/job
- `Variance = Actual Hours - Budgeted Hours`
- `Variance % = Variance / Budgeted × 100`
- Categorizes: Over Budget (positive variance), On Track (negative or zero)

**Drill-down**: Click a job to see which allocations are driving the overrun.

#### 3.9.6 Turnaround Time

**Purpose**: Measure how quickly jobs are completed relative to deadlines.

**Logic**:
- Compares job completion dates (or current date for in-progress jobs) against deadlines
- Calculates on-time delivery percentage
- Flags jobs at risk of missing deadlines

**Drill-down**: Click a percentage to see overdue/at-risk jobs.

#### 3.9.7 Team Productivity Scorecard

**Purpose**: Composite performance rating for each staff member.

**Formula**:
```
Budget Adherence = Budgeted Hours / Actual Hours × 100
On-Time Delivery % = Jobs completed on or before deadline / Total completed jobs × 100
Efficiency Score = Budget Adherence × 0.6 + On-Time % × 0.4
```

**Drill-down**: Click a score to see the underlying allocation and completion data.

#### 3.9.8 Capacity Planning

**Purpose**: Forecast resource availability and identify overload risks.

**Logic**:
- `Monthly Capacity = Annual Budgeted Hours / 12`
- `Utilization = Allocated Hours / Monthly Capacity × 100`
- Status thresholds:
  - **Overloaded** (>100%)
  - **Optimal** (50-100%)
  - **Under-utilized** (<50%)

**Drill-down**: Click a status to see affected staff members and their allocation details.

#### 3.9.9 Overtime & Burnout Risk

**Purpose**: Identify staff at risk of burnout from excessive overtime.

**Logic**:
- `Overtime % = (Actual - Budgeted) / Budgeted × 100`
- Classification:
  - **High Risk**: Overtime > 30% OR actual hours > monthly capacity × 1.2
  - **Medium Risk**: Overtime > 15% OR actual hours > monthly capacity
  - **Low Risk**: All others

**Drill-down**: Click a risk level to see the affected staff and their overtime breakdown.

#### 3.9.10 Quality Review — Exceptions

**Purpose**: Flag jobs where budget is significantly overrun, indicating potential quality issues.

**Logic**:
- Flags any allocation where `Actual Hours > Budgeted Hours × 1.3` (30%+ over)
- Generates training needs assessment based on variance severity and frequency

**Drill-down**: Click an exception to see the specific allocation, staff, and time entries.

#### 3.9.11 Export Features

- **CSV Export**: Generates a blob download with summary section + detailed data table; drill-down modals also have their own CSV export
- **PDF Export**: Opens a print window with firm branding header (logo, name, tagline from Settings), report content, and print CSS styling

---

## 4. Dashboard

### 4.1 Firm Dashboard (Management View)

Available to Full/Supervisor users. Shows:
- Summary cards: staff count, jobs by status, firm capacity/utilization, revenue
- Capacity breakdown: per-staff effective/allocated/remaining hours and utilization %
- Insights panel: under-utilized staff (<50%), over-utilized staff (>90%), unallocated high-priority jobs, partially allocated priority jobs
- Work status by department: overdue, urgent (<7d), upcoming (7-30d), ongoing counts
- Time summary: firm-wide budgeted vs logged hours, efficiency, effective rate
- Deadline alerts: overdue (red), urgent ≤3 days (orange), upcoming (blue) sections
- Drill-down modals: click under-utilised/over-utilised/jobs-by-status to see detail

### 4.2 Personal Dashboard

Available to all users. Shows:
- Annual targets vs scheduled fees
- Monthly fee breakdown (12-month chart)
- Recent allocations
- Personal time summary: per-job budgeted vs logged, variance, efficiency
- Personal deadlines for their assigned jobs
- Compact timesheet widget (same functionality as My Timesheet page)

---

## 5. Settings & Administration

**Access**: Full/Admin level only.

### 5.1 Firm Branding
- Company name, tagline, address, phone, email, website, tax number
- Logo upload (image file, max 2MB, stored as base64 in database)
- Brand colors (primary, secondary, accent) with color pickers and presets
- Currency selection (ZAR/USD/EUR/GBP)

### 5.2 User Registration
- New users register via the login page (name, email, password)
- Registrations are **pending approval** — listed in Settings
- Admin/Partner approves (creates staff record with defaults) or rejects

### 5.3 System Reset
- Destructive operation: deletes all collections except Settings
- Requires typing "RESET" to confirm
- Option to keep specified admin email

---

## 6. Data Flow & Page Connectivity

### 6.1 Root Data Fetch

On page load and whenever `selectedMonth` changes, the app makes 8 parallel requests:

| Endpoint | Used By |
|---|---|
| `GET /api/staff` | Staff, Allocations, Dashboard, Departments |
| `GET /api/jobs` | Jobs, Allocations, Dashboard |
| `GET /api/allocations?month=` | Allocations, Dashboard |
| `GET /api/dashboard/summary?month=` | Dashboard |
| `GET /api/dashboard/capacity?month=` | Dashboard, Allocations |
| `GET /api/dashboard/insights?month=` | Dashboard |
| `GET /api/settings` | All pages (branding/currency) |
| `GET /api/enums` | All pages (dropdown values) |

### 6.2 Independent Data Fetches

Some pages fetch their own data independently (not from root):

| Page | Endpoints |
|---|---|
| My Timesheet | `GET /api/timesheet/my-allocations/{staffId}` |
| Clients | `GET /api/clients` |
| Job Types | `GET /api/job-types` |
| Templates | `GET /api/templates` |
| Departments | `GET /api/departments` |
| Reports | `GET /api/reports/{reportId}` (dynamic) |
| Personal Dashboard | `GET /api/dashboard/personal/{staffId}`, `GET /api/deadlines/staff/{staffId}` |

### 6.3 Month Sync

The `selectedMonth` state (YYYY-MM format) lives in the root App component and is passed as a prop to child pages that need it (Allocations, My Timesheet, Reports). Changing the month in any page triggers a root re-fetch.

### 6.4 Mutation Flow

All CRUD operations call an `onRefresh` callback that re-executes `fetchData` — reloading all 8 root endpoints. Individual pages may also re-fetch their own independent data after mutations.

---

## 7. Calculation Logic Reference

### 7.1 Allocation Hours

```
Allocated Fee = Job Fee × (Allocation % / 100)
Calculated Hours = Allocated Fee / Staff Hourly Rate
Adjusted Hours = Calculated Hours / Staff Productivity Factor
```

The productivity factor (0-1) accounts for non-billable time. A factor of 0.7 means only 70% of a staff member's time is billable.

### 7.2 Staff Capacity

```
Effective Hours = Available Hours Per Month × Productivity Factor
Remaining Hours = Effective Hours - Sum(All Adjusted Hours for Active Allocations)
Utilization % = Allocated Hours / Effective Hours × 100
```

### 7.3 Efficiency Status

```
Variance = Actual Hours - Budgeted Hours
  ≤ 0              → Efficient
  ≤ 20% of budget  → Slightly Over
  ≤ 50% of budget  → Over Budget
  > 50% of budget  → Significantly Over
  No time logged   → In Progress
```

### 7.4 Job Status State Machine

```
PENDING → PARTIALLY_ALLOCATED → FULLY_ALLOCATED → IN_PROGRESS → COMPLETED
                                                        ↓
                                                   ON_HOLD
                                                        ↓
                                              PENDING_AUTHORIZATION
```

Triggered by allocation percentage sums:
- 0% → PENDING
- > 0% and < 100% → PARTIALLY_ALLOCATED
- ≥ 100% → FULLY_ALLOCATED
- Time logged → IN_PROGRESS

### 7.5 Report Formulas

| Report | Key Formula |
|---|---|
| Utilization | `Allocated Hours / Period Budget × 100` |
| Productivity | `Actual Hours / Allocated Hours × 100` |
| WIP Value | `Allocated Fee × (Actual Hrs / Budgeted Hrs)` |
| Gross Margin | `(Revenue - Labor Cost) / Revenue × 100` |
| Team Score | `Budget Adherence × 0.6 + On-Time % × 0.4` |
| Overtime Risk | `(Actual - Budgeted) / Budgeted × 100` |
| Quality Exception | Actual > Budget × 1.3 |

---

## 8. Collections (MongoDB)

| Collection | Purpose |
|---|---|
| `staff` | Staff members with roles, rates, permissions |
| `jobs` | Client engagements with fees, deadlines, status |
| `allocations` | Staff-to-job assignments with percentage and fee |
| `time_entries` | Hours logged against allocations |
| `clients` | Client records |
| `departments` | Organizational units with codes and supervisors |
| `sessions` | Auth tokens |
| `settings` | Firm-wide configuration (singleton) |
| `custom_job_types` | User-defined job type extensions |
| `templates` | Reusable job templates |
| `authorization_requests` | Over-capacity approval requests |
| `notifications` | In-app notification records |
| `registration_requests` | Pending user registrations |
| `webhooks` | External integration webhooks |
