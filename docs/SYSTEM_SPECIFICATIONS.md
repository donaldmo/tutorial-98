# SA Accounting Workflow Planner
## System Specifications Document

**Version:** 2.0  
**Last Updated:** December 2024  
**Document Type:** User & Technical Specifications

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Overview](#2-system-overview)
3. [User Roles & Access Levels](#3-user-roles--access-levels)
4. [Core Modules](#4-core-modules)
5. [Feature Specifications](#5-feature-specifications)
6. [Workflow Processes](#6-workflow-processes)
7. [Reports & Analytics](#7-reports--analytics)
8. [System Administration](#8-system-administration)
9. [Technical Architecture](#9-technical-architecture)
10. [Security & Data Protection](#10-security--data-protection)

---

## 1. Executive Summary

The **SA Accounting Workflow Planner** is a comprehensive web-based workflow management system designed specifically for accounting and consulting firms. The system enables firms to efficiently manage staff resources, client jobs, time tracking, and capacity planning while providing real-time insights through interactive dashboards and reports.

### Key Benefits

- **Resource Optimization** - Allocate staff to jobs based on capacity and skills
- **Time Tracking** - Accurate logging of billable hours against job allocations
- **Financial Visibility** - Real-time fee tracking and budget monitoring
- **Compliance** - Authorization workflows for over-capacity allocations
- **Reporting** - 10+ comprehensive reports with export capabilities
- **Customization** - Corporate branding and company-specific settings

---

## 2. System Overview

### 2.1 Purpose

The system addresses the following business needs:

| Business Need | Solution |
|---------------|----------|
| Staff capacity management | Real-time utilization tracking and capacity alerts |
| Job costing and budgeting | Fee-based allocation with variance analysis |
| Time tracking | Dedicated timesheet module with job linking |
| Deadline management | Automated deadline tracking with notifications |
| Resource authorization | Approval workflow for over-capacity allocations |
| Performance reporting | Interactive dashboards and exportable reports |

### 2.2 System Components

```
┌─────────────────────────────────────────────────────────────┐
│                    SA Workflow Planner                       │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Staff     │  │    Jobs     │  │ Allocations │         │
│  │ Management  │  │ Management  │  │ & Capacity  │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │    Time     │  │  Reports &  │  │   Admin &   │         │
│  │  Tracking   │  │  Analytics  │  │  Settings   │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. User Roles & Access Levels

### 3.1 Access Level Hierarchy

| Access Level | Description | Permissions |
|--------------|-------------|-------------|
| **Full (Partner)** | Complete system access | All features, user management, delete records |
| **Admin** | Administrative access | All features except delete operations |
| **Supervisor** | Team management | Team dashboards, departmental reports, own work |
| **Standard (Employee)** | Personal access only | Personal dashboard, timesheet, own allocations |

### 3.2 Role Definitions

| Role | Typical Access Level | Description |
|------|---------------------|-------------|
| Partner | Full | Firm partners with complete authority |
| Director | Full/Admin | Senior leadership |
| Manager | Admin/Supervisor | Team and client managers |
| Senior Accountant | Supervisor | Experienced staff with team oversight |
| Accountant | Standard | Core accounting staff |
| Junior Accountant | Standard | Entry-level accountants |
| Trainee | Standard | Training/article clerks |

### 3.3 Permission Matrix

| Feature | Full | Admin | Supervisor | Standard |
|---------|------|-------|------------|----------|
| Firm Dashboard | ✅ | ✅ | ❌ | ❌ |
| Personal Dashboard | ✅ | ✅ | ✅ | ✅ |
| Staff Management | ✅ | ✅ | ❌ | ❌ |
| Job Management | ✅ | ✅ | ❌ | ❌ |
| Create Allocations | ✅ | ✅ | ❌ | ❌ |
| Time Tracking | ✅ | ✅ | ✅ | ✅ |
| View Reports | ✅ | ✅ | ✅ | ❌ |
| Approve Authorizations | ✅ | ✅ | ✅ | ❌ |
| User Management | ✅ | ✅ | ❌ | ❌ |
| System Settings | ✅ | ✅ | ❌ | ❌ |
| Delete Records | ✅ | ❌ | ❌ | ❌ |
| Reset System | ✅ | ❌ | ❌ | ❌ |

---

## 4. Core Modules

### 4.1 Dashboard Module

#### Firm Dashboard (Management View)
The main management dashboard provides a comprehensive overview of firm-wide operations:

**Key Metrics Displayed:**
- Total Active Staff
- Total Jobs (with status breakdown)
- Monthly Fee Budget vs Allocated
- Firm-wide Utilization Percentage

**Sections:**
1. **Fees Analysis** - Budget vs Allocated vs Logged comparison
2. **Hours Analysis** - Budgeted vs Allocated vs Logged hours
3. **Utilization Overview** - Staff utilization percentages
4. **Deadline Alerts** - Overdue, Urgent, and Upcoming deadlines
5. **Authorization Requests** - Pending approvals for over-capacity allocations

#### Personal Dashboard (Employee View)
Individual staff members see their personal metrics:

- Personal utilization percentage
- Assigned jobs and allocations
- Hours logged vs budgeted
- Upcoming deadlines
- Recent time entries

### 4.2 Staff Management Module

**Features:**
- Create, edit, and delete staff profiles
- Assign roles and access levels
- Set hourly rates and productivity factors
- Define annual fee budgets and working hours
- Assign to departments
- Bulk import via CSV

**Staff Profile Fields:**

| Field | Description | Required |
|-------|-------------|----------|
| Name | Full name | Yes |
| Email | Login email | Yes |
| Role | Job title/position | Yes |
| Access Level | System permissions | Yes |
| Hourly Rate | Billing rate | Yes |
| Productivity Factor | Billable time ratio (0-1) | Yes |
| Annual Fee Budget | Target fees for the year | No |
| Annual Budgeted Hours | Expected working hours | Yes |
| Department | Assigned department | No |
| Manager | Reporting manager | No |

### 4.3 Jobs Management Module

**Features:**
- Create and manage client jobs
- Set job fees and priorities
- Track job status progression
- Define deadlines
- Link to job templates

**Job Fields:**

| Field | Description | Options |
|-------|-------------|---------|
| Job Name | Descriptive name | Free text |
| Client Name | Client identifier | Free text |
| Job Type | Category of work | Bookkeeping, Tax Compliance, Audit, etc. |
| Total Fee | Job value | Currency amount |
| Priority | Urgency level | Critical, High, Medium, Low |
| Status | Current state | Pending, Partially Allocated, Fully Allocated, In Progress, Completed, On Hold |
| Deadline | Due date | Date picker |
| Department | Assigned department | Department list |

**Job Types Available:**
- Bookkeeping
- Tax Compliance
- SARS EMP201/501
- SARS IT14 Returns
- VAT Returns & Reconciliation
- CIPC Annual Returns
- CIPC Company Registration
- B-BBEE Verification
- Statutory Audit
- Internal Audit
- Review Engagement
- Advisory Services
- Consulting
- Payroll Processing
- Annual Financial Statements
- Management Accounts
- Other

### 4.4 Allocations Module

**Purpose:** Link staff members to jobs with specific percentage and fee allocations.

**Allocation Process:**
1. Select a job to allocate
2. Choose staff member(s)
3. Set allocation percentage (of job fee)
4. System calculates allocated fee and base hours
5. If staff is over-capacity, authorization is required
6. Approved allocations are created automatically

**Allocation Fields:**

| Field | Calculation |
|-------|-------------|
| Allocated Percentage | User-defined (1-100%) |
| Allocated Fee | Job Fee × Percentage |
| Base Hours | Allocated Fee ÷ Staff Hourly Rate |
| Adjusted Hours | Base Hours × Productivity Factor |

**Capacity Checking:**
- System checks if allocation would exceed staff's available capacity
- Over-capacity allocations trigger authorization workflow
- Partners/Supervisors can approve or reject requests

### 4.5 Time Tracking Module

**My Timesheet Page:**
- Dedicated page for logging time
- View all assigned allocations
- Log hours against specific allocations
- Add descriptions for time entries
- View time summary per allocation

**Time Entry Fields:**
- Allocation (job + staff link)
- Hours worked
- Date
- Description/notes

**Time Summary:**
- Total hours logged per allocation
- Percentage of budgeted hours used
- Remaining hours available
- Efficiency status (Efficient, Over Budget, etc.)

### 4.6 Departments Module

**Features:**
- Create organizational departments
- Assign supervisors to departments
- Link staff to departments
- Department-based reporting

**Department Fields:**
- Name
- Description
- Supervisor (staff member)
- Partners (multiple)

---

## 5. Feature Specifications

### 5.1 User Registration & Authentication

**Registration Process:**
1. User completes registration form (Name, Email, Phone, Password)
2. Registration submitted as "Pending"
3. Administrators notified of new registration
4. Admin reviews and assigns Role + Access Level
5. Upon approval, user account is created
6. User notified via email (if configured)

**Login Options:**
- Email + Password authentication
- Guest/Demo mode (for evaluation)

### 5.2 Authorization Workflow

**Trigger:** Allocation to over-capacity staff member

**Process Flow:**
```
┌─────────────────┐
│ Create Allocation│
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ Capacity Check  │────▶│ Under Capacity  │──▶ Allocation Created
└────────┬────────┘     └─────────────────┘
         │
         ▼ Over Capacity
┌─────────────────┐
│ Create Auth     │
│ Request         │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Supervisor/     │
│ Partner Review  │
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌───────┐  ┌───────┐
│Approve│  │Reject │
└───┬───┘  └───────┘
    │
    ▼
┌─────────────────┐
│ Auto-Create     │
│ Allocation      │
└─────────────────┘
```

### 5.3 Deadline Management

**Deadline Categories:**
| Category | Definition | Display Color |
|----------|------------|---------------|
| Overdue | Past deadline | Red |
| Urgent | Due within 3 days | Orange |
| Upcoming | Due within 7-30 days | Blue |

**Notifications:**
- Dashboard widgets show deadline alerts
- Email notifications (when configured)
- Filterable deadline views

### 5.4 Bulk Import

**Staff Import (CSV):**
```csv
name,email,role,hourly_rate,productivity_factor
John Smith,john@firm.co.za,Accountant,500,0.7
Jane Doe,jane@firm.co.za,Senior Accountant,750,0.75
```

**Supported Fields:**
- name (required)
- email (required)
- role (required)
- hourly_rate
- productivity_factor
- annual_fee_budget
- annual_budgeted_hours

### 5.5 Corporate Branding

**Customizable Elements:**
- Company Logo (URL)
- Primary Color (hex)
- Secondary Color (hex)
- Accent Color (hex)
- Firm Name
- Tagline

**Applied To:**
- Sidebar header
- Active navigation items
- Report headers
- Email templates

---

## 6. Workflow Processes

### 6.1 Job Lifecycle

```
┌──────────┐   ┌───────────────────┐   ┌─────────────────┐
│  Pending │──▶│ Partially Allocated│──▶│ Fully Allocated │
└──────────┘   └───────────────────┘   └────────┬────────┘
                                                │
                                                ▼
┌──────────┐   ┌───────────────────┐   ┌─────────────────┐
│Completed │◀──│    In Progress    │◀──│   Work Begins   │
└──────────┘   └───────────────────┘   └─────────────────┘
```

### 6.2 Monthly Workflow

1. **Planning Phase**
   - Review available staff capacity
   - Create/import new jobs
   - Allocate jobs to staff
   - Handle authorization requests

2. **Execution Phase**
   - Staff log time against allocations
   - Monitor utilization dashboards
   - Track deadline progress

3. **Review Phase**
   - Generate utilization reports
   - Review efficiency metrics
   - Analyze fee variances

---

## 7. Reports & Analytics

### 7.1 Available Reports

| # | Report Name | Description |
|---|-------------|-------------|
| 1 | Staff Utilization | Hours and fees per staff member |
| 2 | Job Profitability | Fee vs time analysis per job |
| 3 | Capacity Planning | Available vs allocated capacity |
| 4 | Deadline Compliance | On-time delivery metrics |
| 5 | Department Performance | Metrics by department |
| 6 | Monthly Trends | Month-over-month comparisons |
| 7 | Client Revenue | Revenue by client |
| 8 | Staff Efficiency | Productivity analysis |
| 9 | Authorization Log | Over-capacity approval history |
| 10 | Time Entry Audit | Detailed time logging report |

### 7.2 Report Features

**Interactive Elements:**
- Clickable metric cards for drill-down
- Sortable data tables
- Filter by period/department/staff

**Export Options:**
- CSV download
- Print to PDF
- Data drill-down modals

### 7.3 Key Performance Indicators

| KPI | Formula | Target |
|-----|---------|--------|
| Staff Utilization | Allocated Hours ÷ Available Hours | 70-85% |
| Budget Variance | (Allocated - Budget) ÷ Budget | ±10% |
| Deadline Compliance | On-time Jobs ÷ Total Jobs | >95% |
| Time Logging Rate | Logged Hours ÷ Allocated Hours | >90% |

---

## 8. System Administration

### 8.1 Settings Configuration

**Company Details:**
- Firm/Company Name
- Tagline
- Address
- Phone Number
- Email
- Website
- Tax/Registration Number

**Financial Settings:**
- Currency (ZAR, USD, EUR, GBP)
- Default Working Hours per Month
- Financial Year Start Month

**Branding Settings:**
- Logo URL
- Primary Color
- Secondary Color
- Accent Color

### 8.2 User Management

**Capabilities:**
- View all system users
- Edit user roles and access levels
- Toggle delete permissions
- Filter by role/access level
- Search by name/email

### 8.3 System Reset

**⚠️ Danger Zone Feature**

Allows complete system reset:
- Clears all staff members
- Removes all jobs
- Deletes all allocations
- Removes all time entries
- Clears departments
- Removes pending registrations

**Preserved:**
- System settings
- Branding configuration

**Safety Measures:**
- Confirmation modal required
- Must type "RESET" to confirm
- Partner-level access only

---

## 9. Technical Architecture

### 9.1 Technology Stack

| Component | Technology |
|-----------|------------|
| Frontend | React.js with Tailwind CSS |
| Backend | FastAPI (Python) |
| Database | MongoDB |
| Authentication | Token-based (JWT-style) |
| Email Service | Resend (optional) |

### 9.2 System Requirements

**Server Requirements:**
- Python 3.9+
- Node.js 16+
- MongoDB 5.0+
- 2GB RAM minimum
- 10GB storage

**Browser Support:**
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

### 9.3 API Structure

All API endpoints prefixed with `/api/`:

| Endpoint | Method | Description |
|----------|--------|-------------|
| /auth/login | POST | User authentication |
| /auth/register | POST | New user registration |
| /auth/registrations | GET | Get pending registrations |
| /staff | GET/POST | Staff management |
| /jobs | GET/POST | Job management |
| /allocations | GET/POST | Allocation management |
| /time-entries | GET/POST | Time tracking |
| /departments | GET/POST | Department management |
| /reports/* | GET | Various reports |
| /settings | GET/PUT | System settings |
| /system/reset | POST | System reset |

---

## 10. Security & Data Protection

### 10.1 Authentication Security

- Password hashing using SHA-256 with salt
- Session tokens for authenticated requests
- Automatic session expiry
- Role-based access control (RBAC)

### 10.2 Data Protection

- All data stored in MongoDB with proper indexing
- API input validation using Pydantic models
- CORS protection for API endpoints
- Sensitive data excluded from API responses (_id fields)

### 10.3 Audit Trail

The system maintains records of:
- User login sessions
- Authorization request history
- Time entry modifications
- Settings changes

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| Allocation | Assignment of a staff member to a job with a percentage |
| Capacity | Available working hours for a staff member |
| Productivity Factor | Ratio of billable to total work time (0-1) |
| Utilization | Percentage of capacity that is allocated |
| Authorization | Approval required for over-capacity allocations |
| Base Hours | Calculated hours before productivity adjustment |

## Appendix B: Quick Start Guide

### For Administrators

1. **Initial Setup**
   - Log in with Partner credentials
   - Go to Settings → Configure company details
   - Set up branding (logo, colors)
   - Create departments

2. **Add Staff**
   - Navigate to Staff page
   - Click "Add Staff" or use Bulk Import
   - Set roles, rates, and access levels

3. **Create Jobs**
   - Navigate to Jobs page
   - Add jobs with fees and deadlines
   - Assign to departments

4. **Allocate Work**
   - Go to Allocations page
   - Select jobs and assign to staff
   - Approve any authorization requests

### For Staff Members

1. **Log In**
   - Use email and password provided by admin
   - Or register and wait for approval

2. **View Dashboard**
   - Check personal utilization
   - Review assigned jobs
   - Note upcoming deadlines

3. **Log Time**
   - Go to "My Timesheet"
   - Select allocation
   - Enter hours and description
   - Submit time entry

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Nov 2024 | System | Initial release |
| 2.0 | Dec 2024 | System | Added registration, branding, reset features |

---

*This document is auto-generated based on system specifications. For the latest updates, please refer to the system administrator.*
