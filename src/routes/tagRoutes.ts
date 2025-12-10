import express from 'express';
import { isAuthenticated } from '../middleware/auth';
import { getPostTags, getTags } from '../controllers/tagControllers';

const router = express.Router();

router.get("/:postId/tags", getPostTags);
router.get("/all-tags", isAuthenticated, getTags);

export default router;