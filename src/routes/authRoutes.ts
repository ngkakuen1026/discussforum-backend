import express from 'express';
import { checkEmail, checkUsername, cleanupTempImage, loginUser, logoutUser, refreshUserToken, registerUser, tempUploadImage } from '../controllers/authControllers';
import upload from '../middleware/multer';

const router = express.Router();

router.post("/register", registerUser);
router.post("/register/upload-temp", upload.single("profile_image"), tempUploadImage);
router.post("/register/cleanup-temp", cleanupTempImage);
router.post("/register/check-username", checkUsername);
router.post("/register/check-email", checkEmail);
router.post("/login", loginUser);
router.post("/logout", logoutUser);
router.post("/token", refreshUserToken);

export default router;