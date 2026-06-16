import { Router } from 'express';
import {
  listNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} from '../controllers/notificationsController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, listNotifications);
router.get('/unread-count', requireAuth, getUnreadCount);
router.put('/:notification_id/read', requireAuth, markAsRead);
router.put('/read-all', requireAuth, markAllAsRead);
router.delete('/:notification_id', requireAuth, deleteNotification);

export default router;
