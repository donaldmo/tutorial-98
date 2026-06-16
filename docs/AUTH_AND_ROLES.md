# Auth & User Roles

A quick reference for who can do what, and how to get in.

---

## Super Admin (Platform Level)

Manages the entire SaaS platform — all firms, payments, activity, and announcements.

**Login**
- URL: `/super-admin/login`
- API: `POST /api/saas/admin/login`
- Default credentials:
  ```
  Email:    superadmin@brendmo.com
  Password: SuperAdmin123!
  ```
- Override via `.env`: `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, `SUPER_ADMIN_NAME`
- Auto-seeded on first boot if no super admin exists.

**Dashboard includes:**
- Total/Active/Pending/Suspended firms
- Monthly & total revenue
- Firm list with search, filter (status, plan)
- Firm detail view (stats, plan management, status toggle)
- Payments list
- Activity log (audit trail)
- Announcements (broadcast to all firms)

---

## Admin (Firm Level)

These are the people running an individual firm. Three roles:

| Role | Permissions |
|------|-------------|
| **Owner** | Full access. Created on signup. Can manage users, settings, billing. |
| **Admin** | Full firm access. Invited by the owner. |
| **Supervisor** | Team dashboards, reports, approve timesheets. Cannot manage users, settings, or delete records. |

**Login**
- URL: `/login` (main app)
- API: `POST /api/auth/login`
- Seeded on first boot via `.env`: `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`, `ADMIN_ORG_NAME`

---

## Staff (Employee Level)

Individual contributors who log time and manage their own allocations.

| Former Title | Mapped To |
|--------------|-----------|
| Partner / Director | Admin-level access |
| Manager / Senior Accountant | Supervisor-level access |
| Accountant / Junior / Trainee | Standard (personal access only) |

**Login**
- Via the main app login
- Credentials are set by the firm admin (invite or CSV import)

**Permissions:**
- Personal dashboard
- Timesheet / time entry
- Own allocations and deadlines

---

## Quick Env Reference

```env
# Super Admin (platform)
SUPER_ADMIN_EMAIL=superadmin@brendmo.com
SUPER_ADMIN_PASSWORD=SuperAdmin123!
SUPER_ADMIN_NAME=Super Admin

# Firm Admin (seeded on first boot)
ADMIN_EMAIL=admin@myfirm.com
ADMIN_PASSWORD=something-secure
ADMIN_NAME=Firm Owner
ADMIN_ORG_NAME=My Firm
```
