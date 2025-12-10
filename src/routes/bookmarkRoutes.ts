import express from 'express';
import { isAuthenticated } from '../middleware/auth';
import { addPostToBookmark, removeMultipleBookmarks, removePostFromBookmark, viewBookmarks } from '../controllers/bookmarkControllers';

const router = express.Router();

router.get("/bookmark/me", isAuthenticated, viewBookmarks);
router.post("/bookmark", isAuthenticated, addPostToBookmark);
router.delete("/bookmark/multiple", isAuthenticated, removeMultipleBookmarks);
router.delete("/bookmark/:postId", isAuthenticated, removePostFromBookmark);

export default router;