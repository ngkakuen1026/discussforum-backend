import express from 'express';
import { deleteAccount, editProfile, viewUserProfile } from '../controllers/userControllers';
import { isAuthenticated } from '../middleware/auth';

const router = express.Router();

// Public Routes
router.get("/profile/:id", viewUserProfile);

// Protected Routes (Registered Users)
router.patch("/profile/:id", isAuthenticated, editProfile);
router.delete("/profile/:id", isAuthenticated, deleteAccount);


export default router;