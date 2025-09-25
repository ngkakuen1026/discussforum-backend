import express from 'express';
import { isAuthenticated } from '../middleware/auth';
import { isAdmin } from '../middleware/isAdmin';
import { deleteUserAccount, deleteUserProfileImage, editUserProfile, searchUsers, uploadUserProfileImage, viewAllUsers, viewUserProfile } from '../controllers/adminControllers';
import upload from '../middleware/multer';

const router = express.Router();

// User Routes (Admin access only)
router.get("/all-users", isAuthenticated, isAdmin, viewAllUsers);
router.get("/search-users", isAuthenticated, isAdmin, searchUsers);
router.get("/user/profile/:id", isAuthenticated, isAdmin, viewUserProfile);
router.patch("/user/profile/:id", isAuthenticated, isAdmin, editUserProfile);
router.post("/user/profile/:id/profile-image", isAuthenticated, isAdmin, upload.single("profile_image"), uploadUserProfileImage);
router.delete("/user/profile/:id/profile-image", isAuthenticated, isAdmin, deleteUserProfileImage);
router.delete("/user/profile/:id", isAuthenticated, isAdmin, deleteUserAccount);

export default router;