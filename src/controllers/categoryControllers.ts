import pool from '../db/db';
import { Request, Response } from 'express';

const getAllCategories = async (req: Request, res: Response) => {
    try {
        const result = await pool.query("SELECT id, name, parent_id FROM categories ORDER BY name ASC"); 
        res.status(200).json({ categories: result.rows });
    } catch (error) {
        console.error("Error fetching categories:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }   
};

const getCategoryById = async (req: Request<{ categoryId: string }, {}, {}>, res: Response) => {
    const categoryId = Number(req.params.categoryId);

    try {
        const result = await pool.query("SELECT * FROM categories WHERE id = $1", [categoryId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Category not found" });
        }
        res.status(200).json({ category: result.rows[0] });
    } catch (error) {
        console.error("Error fetching category:", error);
        res.status(500).json({ message: "Internal server error" });
    }
}

export { getAllCategories, getCategoryById };