import express from 'express';
import { isAuthenticated } from '../middleware/auth';
import { reportContent } from '../controllers/reportControllers';

const router = express.Router();

router.post("/report-content/:contentId", isAuthenticated, reportContent);

export default router;