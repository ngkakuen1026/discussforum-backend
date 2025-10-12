import express from 'express';
import { isAuthenticated } from '../middleware/auth';
import { addPostToBookmark, viewBookmarks } from '../controllers/bookmarkControllers';

const router = express.Router();

router.get("/me", isAuthenticated, viewBookmarks);
router.post("/bookmark", isAuthenticated, addPostToBookmark);

export default router;