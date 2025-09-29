import express from 'express';
import { isAuthenticated } from '../middleware/auth';
import { createPost, deletePost, searchPosts, viewAllOwnPosts, viewAllPosts, viewPost } from '../controllers/postControllers';
<<<<<<< HEAD
import { getVotes } from '../controllers/postVoteControllers';
=======
>>>>>>> 7ac20133889df65b9429d1f7b2bce6f0552fbdfb

const router = express.Router();

// Public Route for post
router.get("/all-posts", viewAllPosts);
router.get("/post/:postId", viewPost);
router.get("/search", searchPosts);

// Public Route for post votes
router.get("/votes/:postId", getVotes); 

// Protected Routes for post (Registered Users)
router.get("/all-posts/me", isAuthenticated, viewAllOwnPosts);
router.post("/post", isAuthenticated, createPost);
router.delete("/post/:postId", isAuthenticated, deletePost);

// Protected Routes for post votes (Registered Users)
router.post("/votes/:postId", isAuthenticated, getVotes);

export default router;