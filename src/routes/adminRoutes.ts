import express from 'express';
import { isAuthenticated } from '../middleware/auth';
import { isAdmin } from '../middleware/isAdmin';
import upload from '../middleware/multer';
<<<<<<< HEAD
import { deleteUserAccount, deleteUserPost, deleteUserProfileImage, editUserProfile, searchUsers, uploadUserProfileImage, viewAllUsers, viewUserProfile } from '../controllers/adminControllers';
=======
import { deleteUserAccount, deleteUserProfileImage, editUserProfile, searchUsers, uploadUserProfileImage, viewAllUsers, viewUserProfile } from '../controllers/adminControllers';
>>>>>>> 7ac20133889df65b9429d1f7b2bce6f0552fbdfb
import { searchPosts, viewAllPosts, viewPost } from '../controllers/postControllers';

const router = express.Router();

// User Routes (Admin access only)
router.get("/users/all-users", isAuthenticated, isAdmin, viewAllUsers);
router.get("/users/search-users", isAuthenticated, isAdmin, searchUsers);
router.get("/users/user/profile/:id", isAuthenticated, isAdmin, viewUserProfile);
router.patch("/users/user/profile/:id", isAuthenticated, isAdmin, editUserProfile);
router.post("/users/user/profile/:id/profile-image", isAuthenticated, isAdmin, upload.single("profile_image"), uploadUserProfileImage);
router.delete("/users/user/profile/:id/profile-image", isAuthenticated, isAdmin, deleteUserProfileImage);
router.delete("/users/user/profile/:id", isAuthenticated, isAdmin, deleteUserAccount);

// Post Routes (Admin access only)
router.get("/posts/all-posts", isAuthenticated, isAdmin, viewAllPosts);
router.get("/posts/post/:id", isAuthenticated, isAdmin, viewPost);
router.get("/posts/search-posts", isAuthenticated, isAdmin, searchPosts);
<<<<<<< HEAD
router.delete("/posts/post/:id", isAuthenticated, isAdmin, deleteUserPost);
=======
router.delete("/posts/post/:id", isAuthenticated, isAdmin, deleteUserAccount);
>>>>>>> 7ac20133889df65b9429d1f7b2bce6f0552fbdfb

export default router;