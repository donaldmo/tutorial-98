# Completing an Allocated Work Component — What Happens Behind the Scenes

## Overview

When a staff member finishes working on an allocated job component and clicks **"Complete Component"** in the "Log Time & View Efficiency" modal, the system runs a series of automated steps. This document explains each step in plain language.

---

## Step 1: Checks & Validations

Before anything is saved, the system verifies:

| Check | Why |
|---|---|
| Does the allocation exist? | Prevents clicking on something that was deleted |
| Does the user belong to the right firm? | Ensures you can only complete your own firm's work |
| Is the job still open? | If the job is marked **Completed**, no further changes are allowed |
| Is the user authorized to act for this staff member? | Admins can complete on behalf of others; staff can only complete their own |
| Is this allocation already completed? | Prevents double-completing |
| Is the completion date valid? | The date must be a real date |
| Is the completion date after the start date? | You cannot finish before you started |

If any check fails, the operation stops and an error message is shown.

---

## Step 2: The Allocation is Marked Complete

The system updates the allocation record with:

- **Status** changed to `Completed`
- **Completion date** set to the current date/time (or the date you specified)
- **Who completed it** recorded
- **Duration metrics** calculated:
  - *Assigned-to-started:* How long the allocation sat unstarted after being assigned
  - *Started-to-completed:* How long it took to do the work

If the staff member never formally "started" the work (i.e. never clicked start), the system automatically backdates the start to the completion time.

---

## Step 3: A Snapshot is Saved

A point-in-time snapshot of the allocation is captured and stored in the history. This preserves exactly what the allocation looked like when it was completed — the fee, hours, rates, productivity factor, and other details. This allows the firm to refer back to historical completions even if data changes later.

---

## Step 4: Job Status is Recalculated

The system checks **all allocations** for the job to determine the job's overall status:

- **If every required work component** has at least one completed allocation → the job is marked **Completed**
- **If some components** have started/completed but not all → the job stays **Doing**
- **If nothing** has started → the job stays **Pending**

This means a job automatically moves to "Completed" only once all its pieces are done.

---

## Step 5: Notifications are Sent

A notification and email are sent to every **active admin** in the firm:

> *"[Staff name] closed an allocated component for [Job Name]."*

The email includes:
- Who completed the work
- Which job and client
- The completion date
- The allocation percentage and hours
- Any applicable deadline

This keeps management informed without manual follow-up.

---

## Step 6: Job Efficiency is Calculated

The system calculates how **efficiently** the job was completed by comparing:

```
Efficiency = (Total hours logged on the job ÷ Total budgeted hours) × 100
```

- **Total budgeted hours** = sum of all allocated hours for this job across all staff
- **Total logged hours** = sum of all actual time entries logged against this job

### What the efficiency number means

| Efficiency | Meaning |
|---|---|
| **100%** | Actual time matched the budget exactly |
| **> 100%** | More time was logged than budgeted (overrun) |
| **< 100%** | Less time was logged than budgeted (under budget) |

This efficiency is saved to the job record and tracked historically so you can see trends over time.

---

## Step 7: Staff Productivity Factor is Updated

The staff member's **Productivity Factor** (previously called "Eff." on the allocations page) is automatically updated based on their cumulative work history:

### How it works

1. The system maintains a running total of **all** budgeted hours and logged hours across **every job** the staff member has completed
2. It calculates an overall efficiency:
   ```
   Staff Efficiency = (Total hours logged ÷ Total budgeted hours) × 100
   ```
3. The Productivity Factor is set to this efficiency value, capped at **100%**

### Example

| | Budgeted Hours | Logged Hours | Efficiency |
|---|---|---|---|
| Job A | 46.51 | 40.00 | 86% |
| Job B | 30.00 | 33.00 | 110% |
| **Combined** | **76.51** | **73.00** | **95.4%** |

After completing Job B, the staff member's Productivity Factor would update from 86% to approximately **95%** (weighted average).

### What the Productivity Factor is used for

The Productivity Factor is used in two places:

1. **Budgeted WIP column on the allocations page** — calculated as `Allocated Fee × Productivity Factor`. A factor of 0.86 (86%) means R5,000 fee × 0.86 = **R4,300 budgeted WIP**.
2. **Planning new allocations** — the system uses it to calculate how many hours a staff member can realistically complete (`budgeted hours ÷ productivity factor`).

### History tracking

Every time the Productivity Factor is updated, the previous value is stored in a history log. When a staff member reaches **100% productivity**, old history entries are cleared (only the latest is kept) — representing that they are working at full capacity.

---

## Step 8: API Response

The system returns a summary to the frontend, including:
- The updated allocation details
- The new job status
- The time durations (how long it took to start and complete)
- The job efficiency numbers
- Whether the staff efficiency was updated

The modal then shows a success message and refreshes the data.

---

## Summary — The Full Flow

```
User clicks "Complete Component"
  ↓
Validations (allocation exists, not locked, authorized, etc.)
  ↓
Allocation marked Complete (status, dates, duration metrics)
  ↓
Snapshot saved to history
  ↓
Job status recalculated (Completed / Doing / Pending)
  ↓
Admins notified (in-app + email)
  ↓
Job efficiency calculated (logged hours vs budgeted hours)
  ↓
Staff Productivity Factor updated (weighted average across all jobs, capped at 100%)
  ↓
History logged (or cleared if at 100%)
  ↓
Success shown to user
```
