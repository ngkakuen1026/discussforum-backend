import express from 'express';
import { isAuthenticated } from '../middleware/auth';
import { isAdmin } from '../middleware/isAdmin';
import upload from '../middleware/multer';
import { deleteUserAccount, deleteUserComment, deleteUserPost, deleteUserProfileImage, editUserProfile, searchUsers, uploadUserProfileImage, viewAllUsers, viewUserProfile } from '../controllers/adminControllers';
import { searchPosts, viewAllPosts, viewPost } from '../controllers/postControllers';
import { viewComments } from '../controllers/commentControllers';

const router = express.Router();

// User Routes (Admin access only)
router.get("/users/all-users", isAuthenticated, isAdmin, viewAllUsers);
router.get("/users/search-users", isAuthenticated, isAdmin, searchUsers);
router.get("/users/user/profile/:userId", isAuthenticated, isAdmin, viewUserProfile);
router.patch("/users/user/profile/:userId", isAuthenticated, isAdmin, editUserProfile);
router.post("/users/user/profile/:userId/profile-image", isAuthenticated, isAdmin, upload.single("profile_image"), uploadUserProfileImage);
router.delete("/users/user/profile/:userId/profile-image", isAuthenticated, isAdmin, deleteUserProfileImage);
router.delete("/users/user/profile/:userId", isAuthenticated, isAdmin, deleteUserAccount);

// Post Routes (Admin access only)
router.get("/posts/all-posts", isAuthenticated, isAdmin, viewAllPosts);
router.get("/posts/post/:postId", isAuthenticated, isAdmin, viewPost);
router.get("/posts/search-posts", isAuthenticated, isAdmin, searchPosts);
router.delete("/posts/post/:postId", isAuthenticated, isAdmin, deleteUserPost);

// Comment Routes (Admin access only)
router.get("/comments/all-comments", isAuthenticated, isAdmin, viewComments);
router.delete("/comments/comment/:commentId", isAuthenticated, isAdmin, deleteUserComment);

export default router;