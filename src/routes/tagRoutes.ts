import express from 'express';
import { isAuthenticated } from '../middleware/auth';
import { getPendingTags, getPostTags, getTags } from '../controllers/tagControllers';

const router = express.Router();

router.get("/all-tags", isAuthenticated, getTags);
router.get("/all-pending-tags", getPendingTags);
router.get("/:postId/tags", getPostTags);

export default router;