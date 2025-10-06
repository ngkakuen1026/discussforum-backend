import express from 'express';
import { isAuthenticated } from '../middleware/auth';
import { deleteNotification, getUnreadCount, readNotifications, viewNotifications } from '../controllers/notificationControllers';

const router = express.Router();

router.get("/all-notifications/me", isAuthenticated, viewNotifications);
router.get("/all-notifications/unread-count", isAuthenticated, getUnreadCount);
router.post("/notifications/read", isAuthenticated, readNotifications);
router.delete("/all-notifications/:notificationId", isAuthenticated, deleteNotification);

export default router;