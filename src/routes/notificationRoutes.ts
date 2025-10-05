import express from 'express';
import { isAuthenticated } from '../middleware/auth';
import { viewNotifications } from '../controllers/notificationControllers';

const router = express.Router();

router.get("/all-notifications/me", isAuthenticated, viewNotifications);

export default router;