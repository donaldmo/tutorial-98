# Reports & Analytics Documentation
**Workflow Planner - Reports & Analytics Documentation**

---

## Overview

The Workflow Planner provides **10 built-in management reports** designed for accounting firm partners, managers, and supervisors. Each report can be filtered by Monthly, Annual, or Custom Date Range, and can be exported to CSV or PDF for external use and board presentations.

---

## Report 1: Utilization & Productivity Report

**Purpose:** Measures how effectively your firm's staff time is being used. This is the most important report for an accounting firm because time is your primary revenue-generating resource.

**Who Should Use It:** Partners, Operations Managers

### How It Is Calculated

| Metric | Formula | What It Tells You |
|---|---|---|
| Available Hours | Annual Budgeted Hours / 12 x Number of Months | Total hours a staff member is expected to work in the selected period |
| Allocated Hours | Sum of all job hours assigned to each staff member | Hours that have been planned and assigned to specific jobs |
| Actual Hours | Sum of all timesheet entries logged against allocations | Hours the staff member actually worked |
| Utilization % | (Allocated Hours / Available Hours) x 100 | How much of a staff member's available time has been assigned to jobs |
| Productivity % | (Actual Hours / Allocated Hours) x 100 | How efficiently staff are completing their allocated work |
| Firm Utilization | (Total Allocated Hours / Total Available Hours) x 100 | The firm-wide utilization rate |
| Firm Productivity | (Total Actual Hours / Total Allocated Hours) x 100 | The firm-wide productivity rate |

### How to Interpret

- **Utilization above 80%** = Staff are well-utilized. This is the target range for most accounting firms.
- **Utilization below 60%** = Staff have idle capacity. Consider assigning more jobs or reviewing if roles are needed.
- **Utilization above 100%** = Staff are over-allocated beyond their capacity (risk of burnout).
- **Productivity above 90%** = Staff are completing work within their allocated time (highly efficient).
- **Productivity below 70%** = Staff are taking significantly less time than allocated, which may mean over-budgeting or incomplete work.

### Business Use

- Partner meetings to assess staff performance
- Identify who needs more work or who is overloaded
- Annual performance reviews and bonus decisions
- Pricing decisions (if utilization is too low, you may need to acquire more clients)

---

## Report 2: WIP (Work-in-Progress) Status Report

**Purpose:** Shows all jobs currently in progress and their estimated unbilled value. Essential for managing cash flow and understanding how much revenue is "sitting" in incomplete work.

**Who Should Use It:** Partners, Finance/Billing Managers

### How It Is Calculated

| Metric | Formula | What It Tells You |
|---|---|---|
| Total Fee | Job fee as entered when job was created | The total value of the engagement |
| Allocated Fee | Sum of fees allocated across all staff assigned to the job | The portion of the fee that has been planned |
| Progress % | (Actual Hours Worked / Total Budgeted Hours) x 100 | Percentage of the job completed based on hours |
| WIP Value | Allocated Fee x (Progress % / 100) | The estimated monetary value of work done but not yet billed |
| Total WIP Value | Sum of all individual job WIP values | Total unbilled work across the firm |

### How to Interpret

- **High WIP Value** = You have significant unbilled work. This is revenue waiting to be collected. Issue invoices promptly.
- **Low Progress with High Fee** = A large job hasn't started yet. Check if there's a resourcing bottleneck.
- **Progress near 100% but still "In Progress"** = Job may be complete but hasn't been marked as such. Follow up.

### Business Use

- Monthly billing meetings to decide which clients to invoice
- Cash flow forecasting
- Partner revenue tracking
- Identifying stalled or forgotten jobs that should be completed and billed

### Grouped By Service Line

The report also breaks down WIP by job type (e.g., Tax Returns, Audits, Bookkeeping), so you can see which service lines have the most unbilled work.

---

## Report 3: Firm Profitability Dashboard

**Purpose:** Shows whether your firm is making money on its engagements by comparing revenue earned against labor costs.

**Who Should Use It:** Partners, Senior Management

### How It Is Calculated

| Metric | Formula | What It Tells You |
|---|---|---|
| Revenue | Total job fees for each service line | Income from client engagements |
| Labor Cost | Actual Hours Worked x Staff Hourly Rate x 50% (cost ratio) | Estimated internal cost of delivering the work. The 50% cost ratio represents that roughly half of a staff member's billing rate covers salary, benefits, and overheads |
| Gross Margin | Revenue - Labor Cost | Profit after direct labor costs |
| Margin % | (Gross Margin / Revenue) x 100 | Profitability percentage |
| Overall Margin % | (Total Gross Margin / Total Revenue) x 100 | Firm-wide profitability |

### How to Interpret

- **Margin above 50%** = Very profitable service line. Consider expanding.
- **Margin 30–50%** = Healthy. Standard for most accounting services.
- **Margin below 30%** = Service line may be underpriced or inefficiently delivered. Review staffing and pricing.
- **Negative Margin** = Losing money on this service. Urgent review needed.

### Business Use

- Strategic planning (which services to grow, reduce, or reprice)
- Partner profit distribution discussions
- Annual budgeting and forecasting
- Client engagement pricing reviews

---

## Report 4: Revenue per Employee / per Team

**Purpose:** Shows how much revenue each staff member and each department/team is generating, helping identify top performers and underperformers.

**Who Should Use It:** Partners, Department Heads

### How It Is Calculated

| Metric | Formula | What It Tells You |
|---|---|---|
| Allocated Revenue | Sum of allocated fees from all jobs assigned to the employee for the month | Revenue attributed to this employee |
| Estimated Cost | Sum of Allocated Hours x Hourly Rate x 50% | Internal cost of the employee's work |
| Net Contribution | Allocated Revenue - Estimated Cost | The employee's net value to the firm |
| Revenue per Head (Team) | Team Total Revenue / Number of Staff in Team | Average revenue generated per person in the department |

### How to Interpret

- **High Revenue, High Net Contribution** = Star performer. Reward and retain.
- **High Revenue, Low/Negative Net Contribution** = Generating revenue but costing too much (possibly due to high hourly rate or inefficiency).
- **Low Revenue, Low Cost** = Junior staff or underutilized. May need more work assignments.
- **Revenue per Head comparison across teams** = Shows which departments are most commercially productive.

### Business Use

- Performance-based bonuses and salary reviews
- Departmental budget allocation
- Identifying training needs (low performers may need upskilling)
- Restructuring decisions (merging or expanding departments)

---

## Report 5: Actual vs. Budgeted Hours (Firm View)

**Purpose:** Compares how many hours were actually spent on jobs versus how many were budgeted/planned. This is the key report for identifying scope creep, poor estimates, and inefficiency.

**Who Should Use It:** Partners, Project Managers, Operations Managers

### How It Is Calculated

| Metric | Formula | What It Tells You |
|---|---|---|
| Budgeted Hours | Sum of adjusted hours from all allocations for the job | Hours planned for the job |
| Actual Hours | Sum of timesheet entries logged against the job's allocations | Hours actually worked |
| Variance (Hours) | Actual Hours - Budgeted Hours | The difference (positive = over budget) |
| Variance % | (Variance / Budgeted Hours) x 100 | How far off the estimate was |
| Efficiency Gap | Total Actual - Total Budgeted (firm-wide) | Overall firm budget accuracy |
| Status | "Over Budget" if variance > 0, otherwise "On Track" | Quick assessment of job health |

### How to Interpret

- **Positive Variance (Over Budget)** = More hours were spent than planned. Could indicate scope creep, underquoting, staff inefficiency, or unexpected complexity.
- **Negative Variance (Under Budget)** = Fewer hours used than planned. Could mean efficient delivery or potential over-budgeting.
- **Variance above 20%** = Significant deviation. Investigate the cause.
- **Jobs consistently over budget** = Firm may have a systemic estimating problem.

### Business Use

- Improving future job quoting and pricing
- Identifying jobs with scope creep (client asking for more than agreed)
- Staff coaching (if specific staff are consistently over budget)
- Client negotiations for additional fees

---

## Report 6: Turnaround Time Performance

**Purpose:** Tracks whether jobs are being completed on time by comparing deadlines against actual completion dates.

**Who Should Use It:** Partners, Operations Managers, Client Relationship Managers

### How It Is Calculated

| Metric | Formula | What It Tells You |
|---|---|---|
| Days Variance | Completion Date - Deadline Date (or Current Date - Deadline if still in progress) | Days early (negative) or late (positive) |
| Performance | "On Time" if days variance <= 0, otherwise "Late" | Simple on-time status |
| On-Time % | (On-Time Jobs / Total Jobs with Deadlines) x 100 | Firm-wide on-time delivery rate |

### How to Interpret

- **On-Time % above 90%** = Excellent. Firm is meeting its commitments.
- **On-Time % 70–90%** = Acceptable but needs improvement.
- **On-Time % below 70%** = Serious issue. Clients may be at risk of leaving. Review capacity and workflows.
- **Jobs with no deadline** = These need attention. All jobs should have deadlines for accountability.

### Business Use

- Client retention (late work damages relationships)
- Regulatory compliance (tax deadlines, statutory filings)
- Staff accountability and workload management
- Identifying bottlenecks in the workflow

---

## Report 7: Team Productivity & Efficiency Scorecard

**Purpose:** Provides a combined efficiency score for each team member, weighing both budget adherence and on-time delivery.

**Who Should Use It:** Department Heads, Team Leaders, HR

### How It Is Calculated

| Metric | Formula | What It Tells You |
|---|---|---|
| Budget Adherence | (Budgeted Hours / Actual Hours) x 100, capped at 150% | How well the staff member sticks to time estimates |
| On-Time Delivery % | (Jobs completed on time / Total jobs with deadlines) x 100 | Percentage of jobs delivered on time |
| Efficiency Score | (Budget Adherence x 0.6) + (On-Time Delivery % x 0.4) | Weighted composite score. Budget adherence counts for 60%, on-time delivery for 40% |
| Team Average Budget Adherence | Average of all team members' budget adherence | How well the team overall sticks to estimates |
| Team Average On-Time Delivery | Average of all team members' on-time percentage | Team-wide punctuality |

### How to Interpret

- **Efficiency Score above 90** = Top performer. Efficient and punctual.
- **Efficiency Score 70–90** = Solid performer. Room for minor improvement.
- **Efficiency Score below 70** = Needs attention. May require coaching, training, or workload adjustment.
- **High budget adherence but low on-time delivery** = Staff is efficient with hours but may be taking on too many jobs (capacity issue).
- **Low budget adherence but high on-time delivery** = Meeting deadlines but spending too much time (inefficiency or underquoting).

### Business Use

- Formal performance reviews and appraisals
- Identifying training and development needs
- Team restructuring and resource allocation
- KPI tracking for management reporting

---

## Report 8: Capacity Planning Report

**Purpose:** Shows current resource availability across the firm, identifying who is overloaded and who has spare capacity. Critical for making informed job assignment decisions.

**Who Should Use It:** Partners, Operations Managers, Resource Allocators

### How It Is Calculated

| Metric | Formula | What It Tells You |
|---|---|---|
| Monthly Capacity | Annual Budgeted Hours / 12 | Total hours a staff member can work per month |
| Allocated Hours | Sum of all allocations for the month | Hours already assigned |
| Remaining Hours | Monthly Capacity - Allocated Hours | Available hours for new work |
| Utilization % | (Allocated Hours / Monthly Capacity) x 100 | How full the staff member's schedule is |
| Status | "Overloaded" if >100%, "Under-utilized" if <50%, otherwise "Optimal" | Quick health indicator |

### How to Interpret

- **Overloaded (>100%)** = Staff member has more work than they can handle. Risk of errors, burnout, and missed deadlines. Redistribute work immediately.
- **Optimal (50–100%)** = Healthy workload. This is the target.
- **Under-utilized (<50%)** = Staff member has significant spare capacity. Assign more work or review if the role is justified.

### Business Use

- Before assigning new jobs, check who has capacity
- Monthly resource planning meetings
- Headcount planning (if everyone is overloaded, you may need to hire)
- Identifying candidates for new projects or training assignments

---

## Report 9: Overtime & Burnout Risk Tracker

**Purpose:** Identifies staff members who are working significantly more hours than planned, flagging those at risk of burnout.

**Who Should Use It:** Partners, HR, Department Heads

### How It Is Calculated

| Metric | Formula | What It Tells You |
|---|---|---|
| Budgeted Hours | Sum of allocated hours for the month | Hours planned for the staff member |
| Actual Hours | Sum of timesheet entries for the month | Hours actually worked |
| Overtime Hours | Max(0, Actual Hours - Budgeted Hours) | Hours worked beyond the plan |
| Overtime % | (Overtime Hours / Budgeted Hours) x 100 | How much extra the person is working |
| Risk Level | "High" if Overtime % > 30% OR Actual > 120% of monthly budget; "Medium" if Overtime % > 15% OR Actual > monthly budget; otherwise "Low" | Burnout risk assessment |

### How to Interpret

- **High Risk** = Immediate action needed. Staff is significantly overworked. Redistribute their work, delay non-urgent tasks, or provide support.
- **Medium Risk** = Monitor closely. If this continues for multiple months, it becomes a serious concern.
- **Low Risk** = Within acceptable limits.
- **Consistent overtime across multiple staff** = Firm-wide capacity problem. May need to hire or reduce client intake.

### Business Use

- Duty of care to employees (preventing burnout and turnover)
- Insurance and compliance (excessive overtime may have legal implications)
- Identifying systemic workload problems
- Supporting salary and bonus discussions (acknowledging extra effort)

---

## Report 10: Quality Review Exceptions Report

**Purpose:** Identifies jobs where actual time significantly exceeded the budget (by more than 30%), which may indicate quality issues, rework, or poor initial estimates. Also highlights staff members who frequently exceed budgets, suggesting training needs.

**Who Should Use It:** Quality Assurance Managers, Partners, Training Coordinators

### How It Is Calculated

| Metric | Formula | What It Tells You |
|---|---|---|
| Variance % | ((Actual Hours - Budgeted Hours) / Budgeted Hours) x 100 | How far over budget the work went |
| Exception Flagged | When Variance % > 30% | Only jobs significantly over budget are flagged |
| Exception Type | "Significant Over-Budget" | Categorization of the issue |
| Training Recommendation | "Time estimation and task management" if > 50%, otherwise "Process optimization" | Suggested remedial action |
| Staff Exception Count | Number of flagged exceptions per staff member | How frequently a staff member has quality issues |
| Average Variance per Staff | Total Variance % / Number of Exceptions | Severity of the issue per staff member |

### How to Interpret

- **Many exceptions for one staff member** = That person may need training, mentoring, or a review of their workload.
- **Many exceptions for one job type** = The firm may be underquoting that service, or the process needs improvement.
- **High average variance** = Severe estimation or efficiency problems.
- **Zero exceptions** = Excellent. The firm's estimating and delivery are well-calibrated.

### Business Use

- Continuous improvement programs
- Training needs assessment
- Updating job templates and standard hours
- Client fee negotiations (if rework is caused by client changes)

---

## Dashboard Reports (Home Page)

In addition to the 10 dedicated reports, the main dashboard provides real-time summaries:

### Firm Dashboard Summary

| Metric | Description |
|---|---|
| Total Staff | Count of active staff members |
| Total Jobs | Count of all jobs, broken down by status (Pending, In Progress, Completed) |
| Utilization | (Allocated Hours / Effective Capacity) x 100 for the current month |
| Total Job Fees | Sum of all job fees in the system |

### Work Status Overview

| Status | Description |
|---|---|
| Overdue | Jobs past their deadline that are not completed |
| Urgent (7 days) | Jobs with deadlines within the next 7 days |
| Upcoming (30 days) | Jobs with deadlines within the next 30 days |
| In Progress | Jobs currently being worked on |

### Year-to-Date (YTD) Analysis

**YTD Fees Analysis** — Compares annual fee budget against actual allocated fees from January to the current month.

| Metric | Formula |
|---|---|
| Annual Fee Budget | Sum of all staff annual fee budgets |
| YTD Target | Annual Fee Budget / 12 x Months Elapsed |
| YTD Allocated | Sum of all allocated fees year-to-date |
| Progress % | (YTD Allocated / YTD Target) x 100 |
| Status | "On Track" if progress >= 90% of expected, otherwise "Behind Target" |

**YTD Hours Analysis** — Tracks hour utilization from January to the current month.

| Metric | Formula |
|---|---|
| YTD Available Hours | Sum of staff monthly hours x Months Elapsed |
| YTD Effective Capacity | Available Hours x Productivity Factor (typically 0.8–0.85) |
| YTD Hours Allocated | Sum of all allocated hours year-to-date |
| YTD Hours Logged | Sum of all timesheet entries year-to-date |

---

## Export Options

All reports can be exported in two formats:

1. **CSV Export** — Opens in Excel/Google Sheets. Includes firm header, summary section, and detailed data rows. Useful for further analysis and custom charts.
2. **PDF Export** — Print-ready format with firm branding (logo, name, tagline). Opens in a new browser tab for printing or saving as PDF. Useful for client presentations and board meetings.

---

## Period Filtering

All reports support three period types:

| Filter | Description | Use Case |
|---|---|---|
| Monthly | Select a specific month (e.g., 2026-03) | Regular monthly management reviews |
| Annual | Select a full year (e.g., 2026) | Annual performance reviews and budgeting |
| Custom Range | Select start and end dates | Specific project periods, tax seasons, or audit periods |

---

*Document generated for Workflow Planner by Brendmo Tech — Last updated: March 2026*