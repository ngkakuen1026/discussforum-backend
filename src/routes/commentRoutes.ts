import express from 'express';
import { createComment, replyToComment, viewComments } from '../controllers/commentControllers';
import { isAuthenticated } from '../middleware/auth';
import { getVotes, voteComment } from '../controllers/commentVoteControllers';

const router = express.Router();

// Public Route for comment 
router.get("/:postId/all-comments", viewComments);

// Public Route for comment votes
router.get("/votes/:commentId", getVotes);

// Protected Routes for comment (Registered Users)
router.post("/:postId/comment", isAuthenticated, createComment);
router.post("/:commentId/reply", isAuthenticated, replyToComment);

// Protected Routes for comment votes (Registered Users)
router.post("/votes/:commentId", isAuthenticated, voteComment);

export default router;