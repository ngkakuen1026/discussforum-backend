import express from 'express';
import { isAuthenticated } from '../middleware/auth';
import { createPost, deletePost, searchPosts, viewAllOwnPosts, viewAllPosts, viewPost, viewPostsByCategory } from '../controllers/postControllers';
import { getVotes, votePost } from '../controllers/postVoteControllers';
import attachUserIfExists from '../middleware/attachUserIfExists';
import { logPostHistory } from '../middleware/postHistory';

const router = express.Router();

// Public Route for post
router.get("/all-posts", attachUserIfExists, viewAllPosts);
router.get("/post/:postId", attachUserIfExists, logPostHistory, viewPost);
router.get("/search", searchPosts);

// Public Route for post votes
router.get("/votes/:postId", getVotes); 

// Protected Routes for post (Registered Users)
router.get("/all-posts/me", isAuthenticated, viewAllOwnPosts);
router.post("/post", isAuthenticated, createPost);
router.delete("/post/:postId", isAuthenticated, deletePost);

router.get("/all-posts/category/:categoryId", viewPostsByCategory)

// Protected Routes for post votes (Registered Users)
router.post("/votes/:postId", isAuthenticated, votePost);

export default router;