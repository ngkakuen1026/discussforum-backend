import express from 'express';
import { isAuthenticated } from '../middleware/auth';
import { createPost, deletePost, searchPosts, viewAllOwnPosts, viewAllPosts, viewPost } from '../controllers/postControllers';

const router = express.Router();

// Public Route 
router.get("/all-posts", viewAllPosts);
router.get("/post/:id", viewPost);
router.get("/search", searchPosts);

// Protected Routes (Registered Users)
router.get("/all-posts/me", isAuthenticated, viewAllOwnPosts);
router.post("/post", isAuthenticated, createPost);
router.delete("/post/:postId", isAuthenticated, deletePost);

export default router;