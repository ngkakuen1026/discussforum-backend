import express from 'express';
import { isAuthenticated } from '../middleware/auth';
import { blockUser, getBlockedUsers, unblockUser, updateBlockedReason } from '../controllers/userBlockedControllers';

const router = express.Router();

router.get("/blocked/me", isAuthenticated, getBlockedUsers);
router.post("/block/:userId", isAuthenticated, blockUser);
router.patch("/block/:userId", isAuthenticated, updateBlockedReason);
router.delete("/unblock/:userId", isAuthenticated, unblockUser);

export default router;