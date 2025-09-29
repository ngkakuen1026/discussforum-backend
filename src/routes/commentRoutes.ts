import express from 'express';
import { createComment, viewComments } from '../controllers/commentControllers';
import { isAuthenticated } from '../middleware/auth';

const router = express.Router();

// Public Route for comment 
router.get("/:postId/all-comments", viewComments);

// Public Route for comment votes

// Protected Routes for comment (Registered Users)
router.post("/:postId/comment", isAuthenticated, createComment);

// Protected Routes for comment votes (Registered Users)

export default router;