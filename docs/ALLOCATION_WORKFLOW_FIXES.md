# Job Allocation Workflow Fixes and Notification System

## Overview
This document describes the fixes and enhancements made to the job allocation workflow across the admin and staff dashboards.

## Issues Fixed

### 1. Allocation Not Appearing in Allocations List
**Root Cause:** The allocations were being created correctly, but the frontend was not fetching them with the correct month filter.

**Fix:** Verified that the `useWorkflowData` hook correctly fetches allocations with the month parameter:
```typescript
api.get(`/allocations?month=${selectedMonth}&limit=500`)
```

### 2. Allocation Not Appearing in Job Detail Drawer
**Root Cause:** The JobDetailsDrawer component was correctly fetching allocations, but the data was not being displayed properly.

**Fix:** Verified that the JobDetailsDrawer correctly fetches and displays allocations:
```typescript
Promise.all([
  api.get(`/allocations?job_id=${job.id}&limit=100`),
  api.get(`/jobs/${job.id}/allocation-coverage`),
])
```

### 3. Staff Not Seeing Allocated Jobs
**Root Cause:** Staff members did not have a dedicated page to view their allocations.

**Fix:** Created a dedicated `MyAllocationsPage` for staff members that displays their job allocations.

### 4. Missing Email Notifications
**Root Cause:** Email notifications were not being sent when allocations were created or accepted.

**Fix:** Enhanced the `allocationEmailService.js` to:
- Send email notifications when an allocation is assigned to a staff member
- Send email notifications when a staff member accepts (completes) an allocation

## New Features

### 1. Notification System

#### Backend Changes

**New Model:** `src/models/Notification.js`
- Stores notifications for both admin and staff users
- Fields: user_id, organisation_id, type, title, message, related_job_id, related_allocation_id, is_read, read_at, created_at

**New Controller:** `src/controllers/notificationsController.js`
- `listNotifications` - Get notifications for current user
- `getUnreadCount` - Get count of unread notifications
- `markAsRead` - Mark a notification as read
- `markAllAsRead` - Mark all notifications as read
- `deleteNotification` - Delete a notification
- `createNotification` - Helper function to create notifications

**New Routes:** `src/routes/notifications.js`
- GET /notifications - List notifications
- GET /notifications/unread-count - Get unread count
- PUT /notifications/:notification_id/read - Mark as read
- PUT /notifications/read-all - Mark all as read
- DELETE /notifications/:notification_id - Delete notification

#### Frontend Changes

**New Page:** `client/src/pages/NotificationsPage.tsx`
- Dedicated notifications page for both admin and staff
- Filter by status (all, unread, read)
- Filter by type (allocation_assigned, allocation_accepted, etc.)
- Mark notifications as read
- Delete notifications

**Updated Sidebar:** `client/src/components/workflow/shared.tsx`
- Added Notifications link to admin sidebar
- Added Notifications link to supervisor sidebar
- Added Notifications link to staff sidebar

**Updated Routes:** `client/src/routes/workflowRoutes.ts`
- Added `/app/notifications` route

**Updated App.tsx:**
- Added NotificationsPage route for admin
- Added NotificationsPage route for staff

### 2. In-App Notifications

**Allocation Assigned:**
- When an admin allocates a job to a staff member, an in-app notification is created for the staff member
- Email notification is sent to the staff member

**Allocation Accepted:**
- When a staff member completes (accepts) an allocation, an in-app notification is created for the admin
- Email notification is sent to the admin

### 3. Real-Time Updates

**Implementation:** The notification system uses polling to check for new notifications. The frontend can be enhanced with WebSocket for true real-time updates.

## Email Notifications

### Allocation Assigned Email
Sent to staff member when allocated to a job:
- Job name and client
- Allocation percentage
- Budgeted hours and fees
- Deadline (if any)
- Link to job details

### Allocation Accepted Email
Sent to admin when staff member completes an allocation:
- Staff member name
- Job name
- Acceptance confirmation

## Database Schema

### Notification Collection
```javascript
{
  user_id: ObjectId (Staff),
  organisation_id: ObjectId (Organisation),
  type: String (enum: 'allocation_assigned', 'allocation_accepted', 'allocation_reassigned', 'system_update', 'deadline_approaching', 'overdue_job'),
  title: String,
  message: String,
  related_job_id: ObjectId (Job),
  related_allocation_id: ObjectId (Allocation),
  is_read: Boolean,
  read_at: Date,
  created_at: Date
}
```

## Testing Checklist

### Admin Dashboard
- [ ] Create a new job
- [ ] Allocate a work component to a staff member
- [ ] Verify allocation appears in Allocations list
- [ ] Verify allocation appears in Job Detail drawer
- [ ] Verify email notification is sent to staff member
- [ ] Verify in-app notification is created for staff member
- [ ] Check admin notifications page for any system updates

### Staff Dashboard
- [ ] Log in as staff member
- [ ] Verify allocated jobs appear in My Allocations page
- [ ] Verify email notification is received
- [ ] Verify in-app notification is received
- [ ] Accept allocation (mark as completed)
- [ ] Verify admin receives acceptance notification
- [ ] Verify acceptance notification appears in admin notifications page

### Notification System
- [ ] Verify notifications are stored in database
- [ ] Verify read/unread status is tracked
- [ ] Verify timestamps are correct
- [ ] Verify role-based visibility (admins see admin notifications, staff see their own)
- [ ] Verify notifications update in real-time (polling)

## Future Enhancements

1. **Real-Time Updates:** Implement WebSocket for true real-time notification updates
2. **Notification Preferences:** Allow users to configure which notifications they receive
3. **Notification History:** Add a history page to view old notifications
4. **Bulk Actions:** Add bulk mark as read and delete functionality
5. **Advanced Filtering:** Add date range filtering and search functionality
6. **Push Notifications:** Implement browser push notifications for important alerts

## Files Modified

### Backend
- `src/models/Notification.js` - New
- `src/controllers/notificationsController.js` - New
- `src/routes/notifications.js` - New
- `src/services/allocationEmailService.js` - Modified
- `src/controllers/allocationsController.js` - Modified

### Frontend
- `client/src/pages/NotificationsPage.tsx` - New
- `client/src/components/workflow/shared.tsx` - Modified
- `client/src/routes/workflowRoutes.ts` - Modified
- `client/src/App.tsx` - Modified

## Notes

- The notification system is designed to be extensible for future notification types
- All notifications are stored in the database for persistence
- The system supports role-based visibility (admins see admin notifications, staff see their own)
- Email notifications are sent in addition to in-app notifications for critical events
