import express from 'express';
import { isAuthenticated } from '../middleware/auth';
import { addPostToBookmark, removePostFromBookmark, viewBookmarks } from '../controllers/bookmarkControllers';

const router = express.Router();

router.get("/me", isAuthenticated, viewBookmarks);
router.post("/bookmark", isAuthenticated, addPostToBookmark);
router.delete("/bookmark/:postId", isAuthenticated, removePostFromBookmark);

export default router;