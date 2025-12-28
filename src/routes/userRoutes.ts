import express from 'express';
import { deleteAccount, deleteProfileBanner, deleteProfileImage, editPassword, editProfile, uploadProfileBanner, uploadProfileImage, viewProfile, viewUserProfile } from '../controllers/userControllers';
import { isAuthenticated } from '../middleware/auth';
import upload from '../middleware/multer';

const router = express.Router();

// Public Routes
router.get("/user-profile/:userId", viewUserProfile);

// Protected Routes (Registered Users)
router.get("/profile/me", isAuthenticated, viewProfile);
router.patch("/profile/me", isAuthenticated, editProfile);
router.patch("/profile/password", isAuthenticated, editPassword);
router.delete("/profile/me", isAuthenticated, deleteAccount);
router.post("/profile/me/profile-image", isAuthenticated, upload.single("profile_image"), uploadProfileImage);
router.post("/profile/me/profile-banner", isAuthenticated, upload.single("profile_banner"), uploadProfileBanner);
router.delete("/profile/me/profile-image", isAuthenticated, deleteProfileImage);
router.delete("/profile/me/profile-banner", isAuthenticated, deleteProfileBanner);

export default router;