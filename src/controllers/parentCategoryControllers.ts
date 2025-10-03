import pool from '../db/db';
import e, { Request, Response } from 'express';

const getAllParentCategories = async (req: Request, res: Response) => {
    try {
        const result = await pool.query("SELECT id, name FROM parent_categories ORDER BY id ASC")
        res.status(200).json({ parentCategories: result.rows });
    } catch (error) {
        console.error("Error fetching parent categories:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

const getParentCategoryById = async (req: Request<{ parentCategoryId: string }, {}, {}>, res: Response) => {
    const parentCategoryId = req.params.parentCategoryId;

    try {
        const result = await pool.query("SELECT * FROM parent_categories WHERE id = $1", [parentCategoryId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Parent Category not found" });
        }
    } catch (error) {
        console.error("Error fetching parent category:", error);
        res.status(500).json({ message: "Internal server error" });
    }   
}

export { getAllParentCategories, getParentCategoryById };