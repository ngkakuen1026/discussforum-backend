import express from 'express';
import { deleteAccount, editPassword, editProfile, viewProfile, viewUserProfile } from '../controllers/userControllers';
import { isAuthenticated } from '../middleware/auth';

const router = express.Router();

// Public Routes
router.get("/user-profile/:id", viewUserProfile);

// Protected Routes (Registered Users)
router.get("/profile/me", isAuthenticated, viewProfile);
router.patch("/profile/me", isAuthenticated, editProfile);
router.patch("/profile/password", isAuthenticated, editPassword);
router.delete("/profile/:id", isAuthenticated, deleteAccount);
router.post("/me/profile-image", isAuthenticated);
router.delete("/me/profile-image/delete", isAuthenticated);

export default router;