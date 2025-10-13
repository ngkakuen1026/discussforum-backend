import { Request, Response } from 'express';
import pool from '../db/db';

const getTags = async (req: Request, res: Response) => {
    try {
        const tagsResult = await pool.query("SELECT * FROM tags WHERE approved = TRUE");
        res.status(200).json({
            message: "Tag fetched successfully",
            tags: tagsResult.rows
        });
    } catch (error) {
        console.error("Error fetching tags:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

export { getTags };