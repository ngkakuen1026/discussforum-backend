import express from 'express';
import { isAuthenticated } from '../middleware/auth';
import upload from '../middleware/multer';
import { uploadImage } from '../controllers/imageControllers';

const router = express.Router();

router.post("/image", isAuthenticated, upload.single("image"), uploadImage);

export default router;