import Notification from '../models/Notification.js';
import { toObjectId } from '../utils/objectId.js';
import { serializeDocument, serializeList } from '../utils/serialize.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { parsePagination, buildPaginationMeta } from '../utils/pagination.js';

// GET /notifications - Get notifications for current user
export const listNotifications = asyncHandler(async (req, res) => {
  const query = {
    user_id: req.user._id,
    organisation_id: req.user.organisation_id,
  };

  // Optional month filter (YYYY-MM) on created_at
  if (req.query.month && /^\d{4}-\d{2}$/.test(String(req.query.month))) {
    const [year, month] = String(req.query.month).split('-').map(Number);
    const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const end = new Date(Date.UTC(year, month, 1, 0, 0, 0));
    query.created_at = { $gte: start, $lt: end };
  }

  // Filter by read status
  if (req.query.read_status === 'read') {
    query.is_read = true;
  } else if (req.query.read_status === 'unread') {
    query.is_read = false;
  }

  // Filter by type
  if (req.query.type) {
    query.type = String(req.query.type);
  }

  const { page, limit, skip } = parsePagination(req.query);
  const [records, total] = await Promise.all([
    Notification.find(query)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .populate('related_job_id', 'name client_name')
      .populate('related_allocation_id', 'percentage staff_id'),
    Notification.countDocuments(query),
  ]);

  // Mark as read if requested
  if (req.query.mark_read === 'true') {
    const unreadIds = records
      .filter((n) => !n.is_read)
      .map((n) => n._id);
    if (unreadIds.length > 0) {
      await Notification.updateMany(
        { _id: { $in: unreadIds } },
        { $set: { is_read: true, read_at: new Date() } }
      );
    }
  }

  res.json({
    data: serializeList(records),
    pagination: buildPaginationMeta(total, page, limit),
  });
});

// GET /notifications/unread-count - Get count of unread notifications
export const getUnreadCount = asyncHandler(async (req, res) => {
  const count = await Notification.countDocuments({
    user_id: req.user._id,
    organisation_id: req.user.organisation_id,
    is_read: false,
  });

  res.json({ unread_count: count });
});

// PUT /notifications/:notification_id/read - Mark notification as read
export const markAsRead = asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.notification_id, 'notification_id');

  const notification = await Notification.findById(_id);
  if (!notification) return res.status(404).json({ detail: 'Notification not found' });
  if (String(notification.user_id) !== String(req.user._id)) {
    return res.status(403).json({ detail: 'Access denied' });
  }
  if (String(notification.organisation_id) !== String(req.user.organisation_id)) {
    return res.status(403).json({ detail: 'Access denied' });
  }

  notification.is_read = true;
  notification.read_at = new Date();
  await notification.save();

  res.json(serializeDocument(notification));
});

// PUT /notifications/read-all - Mark all notifications as read
export const markAllAsRead = asyncHandler(async (req, res) => {
  await Notification.updateMany(
    {
      user_id: req.user._id,
      organisation_id: req.user.organisation_id,
      is_read: false,
    },
    { $set: { is_read: true, read_at: new Date() } }
  );

  res.json({ message: 'All notifications marked as read' });
});

// DELETE /notifications/:notification_id - Delete a notification
export const deleteNotification = asyncHandler(async (req, res) => {
  const _id = toObjectId(req.params.notification_id, 'notification_id');

  const notification = await Notification.findById(_id);
  if (!notification) return res.status(404).json({ detail: 'Notification not found' });
  if (String(notification.user_id) !== String(req.user._id)) {
    return res.status(403).json({ detail: 'Access denied' });
  }
  if (String(notification.organisation_id) !== String(req.user.organisation_id)) {
    return res.status(403).json({ detail: 'Access denied' });
  }

  await notification.deleteOne();

  res.json({ message: 'Notification deleted' });
});

// Helper function to create a notification
export const createNotification = async ({
  userId,
  organisationId,
  type,
  title,
  message,
  relatedJobId = null,
  relatedAllocationId = null,
}) => {
  const notification = await Notification.create({
    user_id: userId,
    organisation_id: organisationId,
    type,
    title,
    message,
    related_job_id: relatedJobId,
    related_allocation_id: relatedAllocationId,
  });

  return notification;
};
