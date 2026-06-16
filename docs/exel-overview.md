Now I have a thorough understanding of the document. Here's my complete analysis and Next.js app plan:

---

## 📊 Document Analysis

### Sheet 1 — `Work Component Split` (Master Config)
This is the **configuration/master sheet** that defines:
- **Work allocation ratios** by work type:
  - *Management Accounts*: 10% Senior Review / 40% Accountant / 50% Bookkeeper
  - *Payroll*: 10% Senior / 90% Accountant
  - *Once Off Work*: 10% Senior / 90% Accountant
- **Client list** with monthly fees (incl. VAT), total amounts, and role-based split percentages (P: Reviewer, P: Accountant, MA: Bookkeeper, MA: Accountant, MA: Reviewer)

### Sheets 2–11 — Individual Team Member Schedules
One sheet per person (10 members total):

| Member | Role | Senior Manager |
|---|---|---|
| Star Bongowongo | Senior Auditor | Mollen Mukuze |
| Kenneth Mashava | Accountant | Star Bongowongo |
| Tatenda Chasakara | Accountant | Star Bongowongo |
| Rudzi Mziki | Accounting Intern | Star Bongowongo |
| Katlego Mamatlepa | Junior Accountant | Star Bongowongo |
| Bruce Saurombe | Accountant | Star Bongowongo |
| Christine Mashava | Junior Accountant | Star Bongowongo |
| Lesego Moncho | Accounting Intern | Rudzi Mziki |
| Simelinkosi Kariga | Bookkeeper | Bruce Saurombe |
| Mavis Bincent | Bookkeeper | Kenneth Mashava |

**Each sheet contains:**
- A **Workflow Dashboard** (annual budget, scheduled fees, hours, over/under analysis)
- **12 monthly sections** (Jan–Dec 2026), each with:
  - Charge rate (R700/hr), working days, KPI % (0.8), hours/day
  - Monthly budgeted hours + total scheduled fees
  - A job table split into *Monthly Recurring* (Management Accounts + Payroll) and *Once Off* clients
  - Per job: entity name, notes, estimated fees, completion %, pricing override, budgeted WIP, hours, submission date, comments

---

## 🏗️ Next.js App Plan

### Architecture

```
/app
  /layout.tsx                    ← Sidebar nav + app shell
  /page.tsx                      ← Team overview dashboard
  /team/[member]/page.tsx        ← Individual member workflow
  /team/[member]/[month]/page.tsx ← Monthly job schedule detail
  /clients/page.tsx              ← Client & work allocation view
  /analytics/page.tsx            ← Budget vs actuals charts

/components
  /layout/
    Sidebar.tsx                  ← Member navigation list
    Header.tsx                   ← Page header + month filter
  /dashboard/
    TeamOverviewGrid.tsx         ← All 10 member cards
    MemberStatCard.tsx           ← Budget util %, hours left
    CapacityBar.tsx              ← Visual budget fill indicator
  /member/
    WorkflowDashboard.tsx        ← Annual summary panel
    MonthlyScheduleTable.tsx     ← Job table per month
    MonthNav.tsx                 ← Month switcher (Jan–Dec)
    JobRow.tsx                   ← Single job entry with fields
  /clients/
    ClientAllocationTable.tsx    ← Work split per client
    WorkRatioCard.tsx            ← MA/Payroll/Once-Off splits
  /analytics/
    FeeUtilizationChart.tsx      ← Recharts: scheduled vs budget
    HoursHeatmap.tsx             ← Hours by member by month

/data
  /types.ts                      ← TypeScript interfaces
  /scheduleData.ts               ← Parsed data (members, jobs, months)
  /clientData.ts                 ← Work Component Split data
  /calculations.ts               ← Fee, hours, KPI helpers

/lib
  /utils.ts                      ← Formatters (currency, %)
```

---

### Key Pages & Features

**1. Team Overview Dashboard (`/`)**
- Grid of 10 member cards showing: Role, Annual Budget, Scheduled Fees, % Utilization, Hours Remaining
- Color-coded status: 🔴 Over-scheduled / 🟡 Near budget / 🟢 Under-scheduled
- Quick-filter by role (Senior / Accountant / Bookkeeper / Intern)

**2. Member Workflow Page (`/team/[member]`)**
- Annual summary panel (budget vs scheduled, fee gap)
- Month-by-month selector (Jan–Dec tabs)
- Job table per selected month with columns: #, Client Name, Notes, Estimated Fees, Completion %, WIP Budget, Budgeted Hours, Submission Date, Comments
- Inline editing capability for completion % and notes
- Running totals row at bottom (fees + hours)

**3. Client Allocation Page (`/clients`)**
- Full client list from Work Component Split
- Columns: Client, Payroll, Management Accounts, Total (Excl VAT), role percentages
- Search/filter by client name
- Work ratio summary cards (MA / Payroll / Once Off split visualization)

**4. Analytics Page (`/analytics`)**
- Bar chart: All members' Annual Budget vs Scheduled Fees
- Stacked area chart: Monthly hours load per member
- Table: Over/under hours by member

---

### Data Strategy
Since the data is a **static 2026 plan**, the approach is:
1. Extract all data from the Excel into typed JSON constants (`/data/scheduleData.ts`)
2. No backend needed initially — pure static Next.js with client-side state
3. Future: connect to a database (Supabase/Postgres) to support edits & live updates to completion %

---

Want me to go ahead and **build this app**? I can start by extracting all the data and scaffolding the full Next.js project, or if you'd prefer, I can build it as an interactive **HTML/React artifact** first so you can see the UI immediately.