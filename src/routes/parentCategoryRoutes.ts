import express from 'express';
import { getAllParentCategories, getParentCategoryById } from '../controllers/parentCategoryControllers';

const router = express.Router();

router.get("/all-parent-categories", getAllParentCategories);
router.get("/parent-category/:parentCategoryId", getParentCategoryById);

export default router;