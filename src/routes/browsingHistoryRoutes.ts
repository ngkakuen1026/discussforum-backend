import express from 'express';
import { isAuthenticated } from '../middleware/auth';
import { deleteMultipleHistories, viewOwnBrowsingHistory } from '../controllers/browsingHistoryControllers';

const router = express.Router();

// Public Routes for browsing history 


// Protected Routes for browsing history (Registered Users)
router.get("/browsing-history/me", isAuthenticated, viewOwnBrowsingHistory);
router.delete("/browsing-history/me", isAuthenticated, deleteMultipleHistories);

export default router;