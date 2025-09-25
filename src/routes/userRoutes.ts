import express from 'express';
import { deleteAccount, deleteProfileImage, editPassword, editProfile, uploadProfileImage, viewProfile, viewUserProfile } from '../controllers/userControllers';
import { isAuthenticated } from '../middleware/auth';
import upload from '../middleware/multer';

const router = express.Router();

// Public Routes
router.get("/user-profile/:id", viewUserProfile);

// Protected Routes (Registered Users)
router.get("/profile/me", isAuthenticated, viewProfile);
router.patch("/profile/me", isAuthenticated, editProfile);
router.patch("/profile/password", isAuthenticated, editPassword);
router.delete("/profile/:id", isAuthenticated, deleteAccount);
router.post("/profile/me/profile-image", isAuthenticated, upload.single("profile_image"), uploadProfileImage);
router.delete("/profile/me/profile-image", isAuthenticated, deleteProfileImage);

export default router;