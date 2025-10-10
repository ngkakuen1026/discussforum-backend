import express from 'express';
import { isAuthenticated } from '../middleware/auth';
import { deleteMultipleHistories, viewOwnBrowsingHistory } from '../controllers/browsingHIstoryControllers';

const router = express.Router();

router.get("/browsing-history/me", isAuthenticated, viewOwnBrowsingHistory);
router.delete("/browsing-history/me", isAuthenticated, deleteMultipleHistories);

export default router;