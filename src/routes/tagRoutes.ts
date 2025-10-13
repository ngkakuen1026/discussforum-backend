import express from 'express';
import { isAuthenticated } from '../middleware/auth';
import { getTags } from '../controllers/tagControllers';

const router = express.Router();

router.get("/all-tags", isAuthenticated, getTags);

export default router;