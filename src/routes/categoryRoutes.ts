import express from 'express';
import { getAllCategories, getCategoryById } from '../controllers/categoryControllers';

const router = express.Router();

router.get("/all-categories", getAllCategories);
router.get("/category/:categoryId", getCategoryById);

export default router;